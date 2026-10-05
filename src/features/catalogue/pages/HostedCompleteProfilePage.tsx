'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminIcon } from '../../../components/ui'

interface HostedCompleteProfilePageProps {
  initialClientId?: string
  initialUsername?: string
  initialReturnUrl?: string
}

interface HostedApplication {
  id: string
  clientId?: string
  name: string
  redirectUri?: string
}

interface HostedField {
  name: string
  label?: string
  type: string
  required?: boolean
  options?: string[]
  verification?: string | null
}

interface HostedSchema {
  schemaJson?: any
}

interface ProfileResponse {
  applicationName?: string
  username: string
  fields: Record<string, any>
  verificationStatus?: Record<string, any>
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080'
const ONBOARDING_API_BASE_URL = process.env.NEXT_PUBLIC_ONBOARDING_API_BASE_URL || API_BASE_URL.replace(':8080', ':8081')
const API_BASE_URLS = Array.from(new Set([API_BASE_URL, ONBOARDING_API_BASE_URL]))

const normalizeFieldToken = (value?: string) => (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const verificationFieldNames = new Set(['aadhaar', 'aadhar', 'email', 'phone', 'phone_number', 'mobile', 'mobile_number'])

const normalizeApp = (app: any): HostedApplication => ({
  id: app.applicationId || app.application_id || app.clientId || app.client_id || app.id || '',
  clientId: app.clientId || app.client_id || app.applicationId || app.application_id || '',
  name: app.applicationName || app.name || app.applicationId || 'Connected application',
  redirectUri: app.redirectUri || app.redirect_uri || '',
})

const safeJson = (value: any) => {
  if (!value || typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const registrationFields = (schema?: HostedSchema): HostedField[] => {
  const fields = schema?.schemaJson?.registrationFields || schema?.schemaJson?.fields
  return Array.isArray(fields) ? fields : []
}

const canonicalFieldName = (field: HostedField) => {
  const tokens = [normalizeFieldToken(field.name), normalizeFieldToken(field.label)]
  if (field.type === 'email' || tokens.includes('email')) return 'email'
  if (field.type === 'password' || tokens.includes('password')) return 'password'
  if (field.type === 'phone' || tokens.some((token) => ['mobile', 'mobile_number', 'phone', 'phone_number'].includes(token))) return 'mobile'
  if (tokens.some((token) => ['username', 'user_name', 'login_id', 'userid', 'user_id'].includes(token))) return 'username'
  if (tokens.some((token) => ['first_name', 'firstname', 'given_name'].includes(token))) return 'firstName'
  if (tokens.some((token) => ['last_name', 'lastname', 'surname'].includes(token))) return 'lastName'
  return ''
}

const isPasswordField = (field: HostedField) => canonicalFieldName(field) === 'password'

const requiresOtpVerification = (field: HostedField) => {
  const fieldName = normalizeFieldToken(field.name)
  const labelName = normalizeFieldToken(field.label)
  return Boolean(
    field.verification?.toUpperCase() === 'OTP'
    || field.type === 'email'
    || field.type === 'phone'
    || verificationFieldNames.has(fieldName)
    || verificationFieldNames.has(labelName)
  )
}

const usesBackendEmailOtp = (field: HostedField) => {
  const fieldName = normalizeFieldToken(field.name)
  const labelName = normalizeFieldToken(field.label)
  return field.type === 'email' || fieldName === 'email' || labelName === 'email'
}

const isVerifiedStatus = (value: any) => {
  if (value && typeof value === 'object') return value.verified === true || String(value.verified).toLowerCase() === 'true'
  return value === true || String(value).toLowerCase() === 'true'
}

const verifiedForField = (field: HostedField, verificationStatus: Record<string, any>) => {
  const names = [field.name, canonicalFieldName(field), normalizeFieldToken(field.name), normalizeFieldToken(field.label)].filter(Boolean)
  return names.some((name) => isVerifiedStatus(verificationStatus[name]))
}

const fetchHostedJson = async (path: string) => {
  let lastError: unknown = null
  for (const baseUrl of API_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (response.ok) return data
      lastError = new Error(data?.message || data?.error || `Request failed: ${response.status}`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Identity OS request failed.')
}

const postHostedJson = async (path: string, body: Record<string, unknown>) => {
  let lastError: unknown = null
  for (const baseUrl of API_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) return data
      lastError = new Error(data?.message || data?.error || `Request failed: ${response.status}`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Identity OS request failed.')
}

export default function HostedCompleteProfilePage({ initialClientId = '', initialUsername = '', initialReturnUrl = '' }: HostedCompleteProfilePageProps) {
  const [clientId, setClientId] = useState(initialClientId)
  const [username, setUsername] = useState(initialUsername)
  const [returnUrl, setReturnUrl] = useState(initialReturnUrl)
  const [app, setApp] = useState<HostedApplication | null>(null)
  const [fields, setFields] = useState<HostedField[]>([])
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [verificationStatus, setVerificationStatus] = useState<Record<string, any>>({})
  const [otpState, setOtpState] = useState<Record<string, { sent?: boolean; sending?: boolean; verifying?: boolean; verified?: boolean; otp?: string; value?: string; verificationId?: string }>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('error')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setClientId(initialClientId || params.get('client_id') || '')
    setUsername(initialUsername || params.get('username') || '')
    setReturnUrl(initialReturnUrl || params.get('return_url') || '')
  }, [initialClientId, initialReturnUrl, initialUsername])

  useEffect(() => {
    if (!clientId || !username) {
      setLoading(false)
      setMessageTone('error')
      setMessage('Client id and username are required to complete profile.')
      return
    }

    let cancelled = false
    const loadProfile = async () => {
      setLoading(true)
      setMessage('')
      try {
        const [appData, schemaData, profileData] = await Promise.all([
          fetchHostedJson(`/api/v1/onboarding/applications/client/${encodeURIComponent(clientId)}`),
          fetchHostedJson(`/api/v1/onboarding/identity/schema?clientId=${encodeURIComponent(clientId)}&schemaType=REGISTRATION`),
          fetchHostedJson(`/api/v1/onboarding/identity/profile?clientId=${encodeURIComponent(clientId)}&username=${encodeURIComponent(username)}`),
        ])
        if (cancelled) return
        const normalizedApp = normalizeApp(appData)
        const schema = { schemaJson: safeJson(schemaData?.schemaJson) || schemaData?.schemaJson }
        const profile = profileData as ProfileResponse
        const nextFields = registrationFields(schema)
        const nextValues: Record<string, string> = {}
        nextFields.forEach((field) => {
          const canonical = canonicalFieldName(field)
          const value = profile.fields?.[field.name] ?? (canonical ? profile.fields?.[canonical] : '') ?? ''
          nextValues[field.name] = String(value || '')
        })
        setApp(normalizedApp)
        setFields(nextFields)
        setFormValues(nextValues)
        setVerificationStatus(profile.verificationStatus || {})
      } catch (error) {
        if (!cancelled) {
          setMessageTone('error')
          setMessage(error instanceof Error ? error.message : 'Unable to load profile.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [clientId, username])

  const visibleFields = useMemo(() => fields.filter((field) => !isPasswordField(field)), [fields])

  const missingFields = useMemo(() => visibleFields.filter((field) => {
    const value = String(formValues[field.name] || '').trim()
    return Boolean(field.required && !value) || (requiresOtpVerification(field) && value && !verifiedForField(field, verificationStatus) && !otpState[field.name]?.verified)
  }), [formValues, otpState, verificationStatus, visibleFields])

  const updateField = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }))
    setOtpState((prev) => prev[name]?.verified && prev[name]?.value !== value ? { ...prev, [name]: { sent: false, verified: false, otp: '', value } } : prev)
  }

  const sendOtp = async (field: HostedField) => {
    const value = String(formValues[field.name] || '').trim()
    if (!value) {
      setMessageTone('error')
      setMessage(`Enter ${field.label || field.name} before verification.`)
      return
    }
    setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), sending: true, value } }))
    if (!usesBackendEmailOtp(field)) {
      setOtpState((prev) => ({ ...prev, [field.name]: { sent: true, sending: false, verified: false, otp: '', value } }))
      setMessageTone('success')
      setMessage(`Dummy OTP generated for ${field.label || field.name}. Use 123456.`)
      return
    }
    try {
      const data = await postHostedJson('/api/v1/onboarding/identity/verification/otp/request', {
        clientId,
        fieldName: field.name,
        fieldType: canonicalFieldName(field) || field.type || field.name,
        value,
      })
      setOtpState((prev) => ({ ...prev, [field.name]: { sent: true, sending: false, verified: false, otp: '', value, verificationId: data.verificationId } }))
      setMessageTone('success')
      setMessage(data.message || `OTP sent for ${field.label || field.name}.`)
    } catch (error) {
      setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), sending: false, value } }))
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send OTP.')
    }
  }

  const verifyOtp = async (field: HostedField) => {
    const state = otpState[field.name]
    const currentValue = String(formValues[field.name] || '').trim()
    if (!state?.sent || state.value !== currentValue) {
      setMessageTone('error')
      setMessage(`Generate OTP again for ${field.label || field.name}.`)
      return
    }
    setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), verifying: true } }))
    if (!usesBackendEmailOtp(field)) {
      if ((state.otp || '').trim() !== '123456') {
        setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), verifying: false } }))
        setMessageTone('error')
        setMessage('Invalid OTP. Use 123456 for this verification.')
        return
      }
      setOtpState((prev) => ({ ...prev, [field.name]: { ...state, verifying: false, verified: true, value: currentValue } }))
      setVerificationStatus((prev) => ({ ...prev, [field.name]: { verified: true, method: 'OTP', verifiedAt: new Date().toISOString() } }))
      setMessageTone('success')
      setMessage(`${field.label || field.name} verified successfully.`)
      return
    }
    try {
      const data = await postHostedJson('/api/v1/onboarding/identity/verification/otp/verify', {
        clientId,
        fieldName: field.name,
        value: currentValue,
        otp: state.otp || '',
        verificationId: state.verificationId || '',
      })
      setOtpState((prev) => ({ ...prev, [field.name]: { ...state, verifying: false, verified: true, value: currentValue } }))
      setVerificationStatus((prev) => ({ ...prev, [field.name]: { verified: true, method: 'OTP', verifiedAt: new Date().toISOString() } }))
      setMessageTone('success')
      setMessage(data.message || `${field.label || field.name} verified successfully.`)
    } catch (error) {
      setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), verifying: false } }))
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Invalid OTP.')
    }
  }

  const submit = async () => {
    const missingRequired = visibleFields.find((field) => field.required && !String(formValues[field.name] || '').trim())
    if (missingRequired) {
      setMessageTone('error')
      setMessage(`${missingRequired.label || missingRequired.name} is required.`)
      return
    }
    const unverified = visibleFields.find((field) => requiresOtpVerification(field) && String(formValues[field.name] || '').trim() && !verifiedForField(field, verificationStatus))
    if (unverified) {
      setMessageTone('error')
      setMessage(`Verify ${unverified.label || unverified.name} before saving.`)
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const payloadFields = { ...formValues }
      fields.forEach((field) => {
        const canonical = canonicalFieldName(field)
        if (canonical && formValues[field.name]) payloadFields[canonical] = formValues[field.name]
      })
      await postHostedJson('/api/v1/onboarding/identity/profile/complete', {
        clientId,
        username,
        fields: payloadFields,
        verificationStatus,
      })
      setMessageTone('success')
      setMessage('Profile completed successfully. Returning to your trust score...')
      window.setTimeout(() => {
        window.location.href = returnUrl || `/identity/trust-score?client_id=${encodeURIComponent(clientId)}&username=${encodeURIComponent(username)}`
      }, 700)
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Unable to complete profile.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="hosted-identity-shell"><section className="hosted-card"><p>Loading your Identity OS profile...</p></section></div>
  }

  return (
    <div className="hosted-identity-shell">
      <section className="hosted-card complete-profile-card">
        <div className="hosted-header">
          <span className="hosted-brand"><AdminIcon name="shield" />Identity OS</span>
          <span className="status-pill-ui status-approved">Profile</span>
        </div>
        <div className="hosted-app-summary">
          <span className="hosted-app-icon">{(username || 'U').slice(0, 1).toUpperCase()}</span>
          <div><h1>Complete profile</h1><p>{username || 'User'}{app?.name ? ` - ${app.name}` : ''}</p></div>
        </div>
        <div className="profile-completion-summary">
          <strong>{missingFields.length ? `${missingFields.length} item(s) need attention` : 'Your profile looks complete'}</strong>
          <span>Existing details are shown below. Missing or unverified details are highlighted.</span>
        </div>
        {message && <div className={messageTone === 'success' ? 'hosted-success' : 'hosted-error'}>{message}</div>}
        <form className="hosted-form complete-profile-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
          {visibleFields.map((field) => {
            const needsVerification = requiresOtpVerification(field)
            const verified = verifiedForField(field, verificationStatus)
            const missing = field.required && !String(formValues[field.name] || '').trim()
            const needsAttention = missing || (needsVerification && String(formValues[field.name] || '').trim() && !verified)
            return (
              <label key={field.name} className={needsAttention ? 'complete-profile-field attention' : 'complete-profile-field'}>
                <span>{field.label || field.name}{needsAttention && <em>{missing ? 'Missing' : 'Needs verification'}</em>}</span>
                {field.type === 'dropdown'
                  ? <select value={formValues[field.name] || ''} onChange={(event) => updateField(field.name, event.target.value)}><option value="">Select {field.label || field.name}</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  : needsVerification
                    ? <div className="hosted-verify-field">
                        <div className="hosted-verify-input-row">
                          <input type={field.type === 'email' ? 'email' : 'text'} value={formValues[field.name] || ''} onChange={(event) => updateField(field.name, event.target.value)} placeholder={field.label || field.name} />
                          <button type="button" disabled={verified || otpState[field.name]?.sending} className={verified ? 'hosted-verify-button verified' : 'hosted-verify-button'} onClick={() => sendOtp(field)}>{verified ? 'Verified' : otpState[field.name]?.sending ? 'Sending...' : 'Verify'}</button>
                        </div>
                        {otpState[field.name]?.sent && !verified && <div className="hosted-otp-row">
                          <input inputMode="numeric" maxLength={6} value={otpState[field.name]?.otp || ''} onChange={(event) => setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), otp: event.target.value.replace(/\D/g, '').slice(0, 6) } }))} placeholder="Enter OTP" />
                          <button type="button" disabled={otpState[field.name]?.verifying} className="hosted-otp-button" onClick={() => verifyOtp(field)}>{otpState[field.name]?.verifying ? 'Verifying...' : 'Submit OTP'}</button>
                        </div>}
                      </div>
                    : <input type={field.type === 'email' ? 'email' : 'text'} value={formValues[field.name] || ''} onChange={(event) => updateField(field.name, event.target.value)} placeholder={field.label || field.name} />}
              </label>
            )
          })}
          <div className="hosted-actions">
            <button type="button" className="secondary-button" onClick={() => { window.location.href = returnUrl || '/' }}>Cancel</button>
            <button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Saving...' : 'Save profile'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
