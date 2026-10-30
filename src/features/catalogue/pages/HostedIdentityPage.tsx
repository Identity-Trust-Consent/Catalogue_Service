'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, ShieldCheck, Fingerprint, Sparkles } from 'lucide-react'
import { AdminIcon } from '../../../components/ui'
import { hostedFieldError, hostedFieldKind, isMinorBirthDate, localDateToday, pendingHostedVerifications } from './hosted-field-validation'
import RegistrationNotice, { type RegistrationNoticeData } from './RegistrationNotice'

type HostedMode = 'register' | 'login' | 'choice'

interface HostedIdentityPageProps {
  initialClientId?: string
  initialRedirectUri?: string
  mode: HostedMode
}

interface HostedApplication {
  id: string
  internalId?: string
  clientId?: string
  orgId?: string
  orgName?: string
  name: string
  type?: string
  redirectUri?: string
  status: string
}

interface HostedSchema {
  id: string
  versionId?: string
  appId?: string
  appName?: string
  name: string
  type: 'registration' | 'login'
  schemaJson?: any
  status: string
  versionNumber?: number
}

interface HostedField {
  name: string
  label?: string
  type: string
  required?: boolean
  options?: string[]
  verification?: string | null
  dpdp?: {
    sensitive?: boolean
    consentRequired?: boolean
    purpose?: string
    retentionDays?: number | null
    justification?: string
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080'
const ONBOARDING_API_BASE_URL = process.env.NEXT_PUBLIC_ONBOARDING_API_BASE_URL || API_BASE_URL.replace(':8080', ':8081')
const API_BASE_URLS = Array.from(new Set([API_BASE_URL, ONBOARDING_API_BASE_URL]))

const safeJson = (value: any) => {
  if (!value) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const normalizeApp = (app: any): HostedApplication => ({
  id: app.applicationId || app.id,
  internalId: app.id,
  clientId: app.clientId,
  orgId: app.organizationId || app.orgId,
  orgName: app.organizationName || app.orgName || '',
  name: app.applicationName || app.name || app.applicationId || app.id,
  type: app.applicationType || app.type,
  redirectUri: app.redirectUri,
  status: app.status === 'ACTIVE' || app.status === 'approved' ? 'approved' : app.status === 'SUSPENDED' || app.status === 'rejected' ? 'rejected' : 'pending',
})

const normalizeSchema = (schema: any): HostedSchema => ({
  id: schema.schemaId || schema.id,
  versionId: schema.versionId,
  appId: schema.applicationId || schema.appId,
  appName: schema.applicationName || schema.appName,
  name: schema.schemaName || schema.name,
  type: schema.schemaType === 'LOGIN' || schema.type === 'login' ? 'login' : 'registration',
  schemaJson: safeJson(schema.schemaJson) || schema.schemaJson,
  status: schema.status === 'APPROVED' || schema.status === 'PUBLISHED' || schema.status === 'approved' ? 'approved' : schema.status === 'REJECTED' || schema.status === 'rejected' ? 'rejected' : 'pending',
  versionNumber: schema.versionNumber,
})

const appKeys = (app?: HostedApplication) =>
  app ? [app.id, app.clientId, app.internalId].filter(Boolean) : []

const getApprovedSchema = (schemas: HostedSchema[], app: HostedApplication | undefined, type: 'registration' | 'login') => {
  const keys = appKeys(app)
  return schemas.find((schema) => Boolean(schema.appId && keys.includes(schema.appId)) && schema.type === type && schema.status === 'approved')
}

const getRegistrationFields = (schema?: HostedSchema): HostedField[] => {
  const fields = schema?.schemaJson?.registrationFields || schema?.schemaJson?.fields
  return Array.isArray(fields) && fields.length ? fields : []
}

const getLoginFields = (schema?: HostedSchema): HostedField[] => {
  if (!schema) return []
  const configuredFields = schema.schemaJson?.loginFields || schema.schemaJson?.fields
  if (Array.isArray(configuredFields) && configuredFields.length) return configuredFields
  return []
}

const sensitiveFieldNames = new Set(['aadhaar', 'aadhar', 'pan', 'passport', 'voter_id', 'driving_license', 'biometric', 'date_of_birth', 'dob', 'address'])
const normalizeFieldToken = (value?: string) => (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const verificationFieldNames = new Set(['aadhaar', 'aadhar', 'email', 'phone', 'phone_number', 'mobile', 'mobile_number'])

const isSensitiveField = (field: HostedField) => {
  const fieldName = normalizeFieldToken(field.name)
  return Boolean(field.dpdp?.sensitive || sensitiveFieldNames.has(fieldName) || field.type === 'gov-id' || field.type === 'address')
}

const requiresOtpVerification = (field: HostedField) => {
  const fieldName = normalizeFieldToken(field.name)
  const labelName = normalizeFieldToken(field.label)
  return Boolean(
    field.verification?.toUpperCase() === 'OTP'
    || ['email', 'aadhaar', 'mobile'].includes(hostedFieldKind(field))
    || field.type === 'email'
    || field.type === 'phone'
    || verificationFieldNames.has(fieldName)
    || verificationFieldNames.has(labelName)
  )
}

const usesBackendEmailOtp = (field: HostedField) => {
  return hostedFieldKind(field) === 'email'
}

const getConsentRequiredFields = (schema: HostedSchema | undefined, fields: HostedField[]) => {
  const sensitiveSummary = Array.isArray(schema?.schemaJson?.dpdp?.sensitiveFields) ? schema?.schemaJson?.dpdp?.sensitiveFields : []
  const summaryByName = new Map<string, { consentRequired?: boolean }>(sensitiveSummary.map((field: any) => [normalizeFieldToken(field.name), field]))
  return fields.filter((field) => {
    const summary = summaryByName.get(normalizeFieldToken(field.name))
    return Boolean(field.dpdp?.consentRequired || summary?.consentRequired || isSensitiveField(field))
  })
}

const canonicalFieldName = (field: HostedField) => {
  const tokens = [
    normalizeFieldToken(field.name),
    normalizeFieldToken(field.label),
    normalizeFieldToken(field.name).replace(/_\d+$/, ''),
  ]
  if (field.type === 'email' || tokens.includes('email')) return 'email'
  if (field.type === 'password' || tokens.includes('password')) return 'password'
  if (field.type === 'phone' || tokens.some((token) => ['mobile', 'mobile_number', 'phone', 'phone_number'].includes(token))) return 'mobile'
  if (tokens.some((token) => ['username', 'user_name', 'login_id', 'userid', 'user_id'].includes(token))) return 'username'
  return ''
}

const buildIdentityFieldsPayload = (fields: HostedField[], values: Record<string, string>) => {
  const payload: Record<string, string> = { ...values }
  fields.forEach((field) => {
    const canonicalName = canonicalFieldName(field)
    const value = String(values[field.name] || '').trim()
    if (canonicalName && value && !String(payload[canonicalName] || '').trim()) {
      payload[canonicalName] = value
    }
  })
  return payload
}

const redirectWithParams = (redirectUri: string, params: Record<string, string>) => {
  const url = new URL(redirectUri)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  window.location.href = url.toString()
}

const fetchJsonWithTimeout = async (url: string, timeoutMs = 8000) => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const data = await response.json().catch(() => null)
    return { response, data }
  } finally {
    window.clearTimeout(timeout)
  }
}

const fetchHostedJson = async (path: string, timeoutMs = 4000) => {
  let lastError: unknown = null
  for (const baseUrl of API_BASE_URLS) {
    try {
      const result = await fetchJsonWithTimeout(`${baseUrl}${path}`, timeoutMs)
      if (result.response.ok) return result
      lastError = new Error(`Request failed: ${result.response.status}`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Identity OS request failed.')
}

const hostedIdentityRequest = async (path: string, body: Record<string, unknown>) => {
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
      lastError = new Error(data.message || data.error || `Request failed: ${response.status}`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Identity OS request failed.')
}

const hostedVerificationRequest = async (path: string, body: Record<string, unknown>) => {
  const data = await hostedIdentityRequest(path, body)
  if (!data.success) {
    throw new Error(data.message || 'Verification failed.')
  }
  return data
}

const describeError = (value: any): string => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(describeError).filter(Boolean).join('; ')
  if (typeof value === 'object') {
    if (value.message) return describeError(value.message)
    if (value.error) return describeError(value.error)
    if (value.code) return String(value.code)
    return JSON.stringify(value)
  }
  return String(value)
}

const createConsentNotice = async (body: Record<string, unknown>) => {
  const response = await fetch('/api/consent-notice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(describeError(data.detail || data.message || data.error || data) || 'Unable to open the consent notice.')
  }
  if (!data.id || !data.token || !data.template || !Array.isArray(data.activities)) {
    throw new Error('The consent service did not return a valid notice.')
  }
  return data as RegistrationNoticeData
}

const buildHostedFlowUrl = (mode: 'register' | 'login', clientId: string, redirectUri: string) =>
  `/identity/${mode}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`

export default function HostedIdentityPage({ initialClientId = '', initialRedirectUri = '', mode: initialMode }: HostedIdentityPageProps) {
  const [mode, setMode] = useState(initialMode)
  const [clientId, setClientId] = useState(initialClientId)
  const [redirectUri, setRedirectUri] = useState(initialRedirectUri)
  const [initialUsername, setInitialUsername] = useState('')
  const [returnUrl, setReturnUrl] = useState('')
  const [completionPurpose, setCompletionPurpose] = useState('')
  const [applications, setApplications] = useState<HostedApplication[]>([])
  const [schemas, setSchemas] = useState<HostedSchema[]>([])
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})
  const [queryReady, setQueryReady] = useState(false)
  const [configurationReady, setConfigurationReady] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('error')
  const [submitting, setSubmitting] = useState(false)
  const [consentSubmitting, setConsentSubmitting] = useState(false)
  const [consentError, setConsentError] = useState('')
  const [activeNotice, setActiveNotice] = useState<RegistrationNoticeData | null>(null)
  const [activeNoticeBirthDate, setActiveNoticeBirthDate] = useState('')
  const consentRequestLock = useRef(false)
  const [consentGranted, setConsentGranted] = useState(false)
  const [consentPrincipal, setConsentPrincipal] = useState('')
  const [consentBirthDate, setConsentBirthDate] = useState('')
  const [otpState, setOtpState] = useState<Record<string, { sent?: boolean; sending?: boolean; verifying?: boolean; verified?: boolean; otp?: string; value?: string; verificationId?: string }>>({})
  const otpRequestLocks = useRef<Record<string, boolean>>({})
  const otpVerifyLocks = useRef<Record<string, boolean>>({})

  const resetHostedForm = useCallback(() => {
    setFormValues({}); setFieldErrors({}); setVisiblePasswords({}); setOtpState({}); setActiveNotice(null)
    setMessage(''); setConsentError(''); setConsentGranted(false); setConsentPrincipal(''); setConsentBirthDate('')
  }, [])
  useEffect(() => { setMode(initialMode); resetHostedForm() }, [initialMode, resetHostedForm])
  useEffect(() => {
    const restoreMode = () => {
      const path = window.location.pathname
      if (path === '/identity/login' || path === '/identity/register') {
        setMode(path.endsWith('/login') ? 'login' : 'register')
        resetHostedForm()
      }
    }
    window.addEventListener('popstate', restoreMode)
    return () => window.removeEventListener('popstate', restoreMode)
  }, [resetHostedForm])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setClientId(initialClientId || params.get('client_id') || '')
    setRedirectUri(initialRedirectUri || params.get('redirect_uri') || '')
    setInitialUsername(params.get('username') || '')
    setReturnUrl(params.get('return_url') || '')
    setCompletionPurpose(params.get('purpose') || '')
    setQueryReady(true)
  }, [initialClientId, initialRedirectUri])

  useEffect(() => {
    if (!queryReady) return
    if (!clientId) {
      setConfigurationReady(true)
      return
    }
    const loadDirectConfiguration = async () => {
      setConfigurationReady(false)
      setMessage('')
      try {
        const appResult = await fetchHostedJson(`/api/v1/onboarding/applications/client/${encodeURIComponent(clientId)}`)
        if (appResult.response.ok && appResult.data) {
          const application = normalizeApp(appResult.data)
          setApplications((prev) => [application, ...prev.filter((item) => item.id !== application.id && item.clientId !== application.clientId)])
        }
        const schemaResults = await Promise.allSettled(['REGISTRATION', 'LOGIN'].map(schemaType => fetchHostedJson(`/api/v1/onboarding/identity/schema?clientId=${encodeURIComponent(clientId)}&schemaType=${schemaType}`)))
        for (const result of schemaResults) {
          if (result.status !== 'fulfilled') continue
          const schemaResult = result.value
          if (schemaResult.response.ok && schemaResult.data) {
            const schema = normalizeSchema(schemaResult.data)
            setSchemas((prev) => [schema, ...prev.filter((item) => (item.versionId || item.id) !== (schema.versionId || schema.id))])
          }
        }
      } catch (error) {
        setMessageTone('error')
        setMessage(error instanceof DOMException && error.name === 'AbortError'
          ? 'Identity OS configuration lookup timed out. Please check API gateway and onboarding service.'
          : 'Unable to load Identity OS configuration. Please check API gateway and onboarding service.')
      } finally {
        setConfigurationReady(true)
      }
    }

    loadDirectConfiguration()
  }, [clientId, queryReady])

  const app = useMemo(() => applications.find((item) => appKeys(item).includes(clientId)), [applications, clientId])
  const callbackUri = redirectUri || app?.redirectUri || ''
  const registrationSchema = getApprovedSchema(schemas, app, 'registration')
  const loginSchema = getApprovedSchema(schemas, app, 'login')
  const currentMode = mode === 'choice' ? 'choice' : mode
  const fields = currentMode === 'register' ? [...getRegistrationFields(registrationSchema)].sort((a, b) => Number(hostedFieldKind(b) === 'date') - Number(hostedFieldKind(a) === 'date')) : getLoginFields(loginSchema)
  const otpFields = currentMode === 'register' ? fields.filter(requiresOtpVerification) : []
  const currentSubmittedFields = buildIdentityFieldsPayload(fields, formValues)
  const currentDataPrincipalId = currentSubmittedFields.email || currentSubmittedFields.username || currentSubmittedFields.mobile || currentSubmittedFields.phone || ''
  const birthField = fields.find(field => hostedFieldKind(field) === 'date')
  const currentBirthDate = birthField ? formValues[birthField.name] || '' : ''
  const minorRegistration = currentMode === 'register' && Boolean(birthField && !hostedFieldError({ ...birthField, required: true }, currentBirthDate) && isMinorBirthDate(currentBirthDate))
  const consentFields = currentMode === 'register' ? getConsentRequiredFields(registrationSchema, fields) : []
  const consentRequired = consentFields.length > 0 || minorRegistration
  const schemaMissing = Boolean(app && currentMode === 'register' && !registrationSchema) || Boolean(app && currentMode === 'login' && !loginSchema)
  const fieldsMissing = Boolean(app && currentMode === 'login' && loginSchema && fields.length === 0)
  const authSwitchUrl = buildHostedFlowUrl(currentMode === 'register' ? 'login' : 'register', clientId, callbackUri)
  const switchHostedMode = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (submitting || consentSubmitting || Object.values(otpState).some(state => state.sending || state.verifying)) return
    const nextMode = currentMode === 'register' ? 'login' : 'register'
    const nextUrl = new URL(window.location.href)
    nextUrl.pathname = `/identity/${nextMode}`
    nextUrl.searchParams.set('client_id', clientId); nextUrl.searchParams.set('redirect_uri', callbackUri)
    window.history.pushState(null, '', nextUrl.pathname + nextUrl.search)
    setMode(nextMode); resetHostedForm()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const consentGrantedForCurrentPrincipal = consentGranted && Boolean(currentDataPrincipalId) && consentPrincipal === currentDataPrincipalId && consentBirthDate === currentBirthDate
  const pendingOtpFields = pendingHostedVerifications(otpFields, formValues, otpState)

  useEffect(() => {
    if (currentMode !== 'register' || !initialUsername || !fields.length) return
    const usernameField = fields.find((field) => canonicalFieldName(field) === 'username')
    if (!usernameField) return
    setFormValues((prev) => prev[usernameField.name] ? prev : { ...prev, [usernameField.name]: initialUsername })
  }, [currentMode, fields, initialUsername])

  const updateField = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }))
    const field = fields.find(item => item.name === name)
    if (field && fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: hostedFieldError(field, value) }))
    setOtpState((prev) => prev[name]?.verified && prev[name]?.value !== value ? { ...prev, [name]: { sent: false, verified: false, otp: '', value } } : prev)
  }
  const sendDummyOtp = async (field: HostedField) => {
    const value = String(formValues[field.name] || '').trim()
    const validationError = hostedFieldError(field, formValues[field.name] || '')
    if (validationError) {
      setFieldErrors(prev => ({ ...prev, [field.name]: validationError }))
      return
    }
    if (!value) {
      setMessageTone('error')
      setMessage(`Enter ${field.label || field.name} before verification.`)
      return
    }
    if (otpRequestLocks.current[field.name] || otpState[field.name]?.sending) return
    otpRequestLocks.current[field.name] = true
    setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), sending: true, value } }))
    if (!usesBackendEmailOtp(field)) {
      setOtpState((prev) => ({ ...prev, [field.name]: { sent: true, sending: false, verified: false, otp: '', value } }))
      setMessageTone('success')
      setMessage(`Dummy OTP generated for ${field.label || field.name}. Use 123456.`)
      otpRequestLocks.current[field.name] = false
      return
    }
    try {
      const data = await hostedVerificationRequest('/api/v1/onboarding/identity/verification/otp/request', {
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
    } finally {
      otpRequestLocks.current[field.name] = false
    }
  }
  const verifyDummyOtp = async (field: HostedField) => {
    const state = otpState[field.name]
    const currentValue = String(formValues[field.name] || '').trim()
    if (!state?.sent || state.value !== currentValue) {
      setMessageTone('error')
      setMessage(`Generate OTP again for ${field.label || field.name}.`)
      return
    }
    if (otpVerifyLocks.current[field.name] || state.verifying) return
    otpVerifyLocks.current[field.name] = true
    setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), verifying: true } }))
    if (!usesBackendEmailOtp(field)) {
      if ((state.otp || '').trim() !== '123456') {
        setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), verifying: false } }))
        setMessageTone('error')
        setMessage('Invalid OTP. Use 123456 for this verification.')
        otpVerifyLocks.current[field.name] = false
        return
      }
      setOtpState((prev) => ({ ...prev, [field.name]: { ...state, verifying: false, verified: true, value: currentValue } }))
      setMessageTone('success')
      setMessage(`${field.label || field.name} verified successfully.`)
      otpVerifyLocks.current[field.name] = false
      return
    }
    try {
      const data = await hostedVerificationRequest('/api/v1/onboarding/identity/verification/otp/verify', {
        clientId,
        fieldName: field.name,
        value: currentValue,
        otp: state.otp || '',
        verificationId: state.verificationId || '',
      })
      setOtpState((prev) => ({ ...prev, [field.name]: { ...state, verifying: false, verified: true, value: currentValue } }))
      setMessageTone('success')
      setMessage(data.message || `${field.label || field.name} verified successfully.`)
    } catch (error) {
      setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), verifying: false } }))
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Invalid OTP.')
    } finally {
      otpVerifyLocks.current[field.name] = false
    }
  }
  const giveConsent = async () => {
    if (consentRequestLock.current) return
    setConsentError('')
    if (!app || !callbackUri) {
      setConsentError('Application configuration or redirect URI is missing. Reload the registration page and try again.')
      return
    }
    const submittedFields = buildIdentityFieldsPayload(fields, formValues)
    const dataPrincipalId = submittedFields.email || submittedFields.username || submittedFields.mobile || submittedFields.phone || ''
    if (!dataPrincipalId) {
      setMessageTone('error')
      setMessage('Enter email, username, or phone before giving consent.')
      setConsentError('Enter email, username, or phone before opening the notice.')
      return
    }
    if (birthField) {
      const birthError = hostedFieldError({ ...birthField, required: true }, currentBirthDate)
      if (birthError) { setConsentError(birthError); return }
    }
    consentRequestLock.current = true
    setConsentSubmitting(true)
    setMessage('')
    try {
      const notice = await createConsentNotice({
        clientId,
        dataPrincipalId,
        ...(currentBirthDate ? { dateOfBirth: currentBirthDate } : {}),
      })
      setActiveNotice(notice)
      setActiveNoticeBirthDate(currentBirthDate)
      window.scrollTo({ top: 0 })
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Unable to open the consent notice.')
      setConsentError(error instanceof Error ? error.message : 'Unable to open the consent notice. Please try again.')
    } finally {
      consentRequestLock.current = false
      setConsentSubmitting(false)
    }
  }
  const submit = async () => {
    if (currentMode === 'register') {
      const errors = Object.fromEntries(fields.map(field => [field.name, hostedFieldError(field, formValues[field.name] || '')]))
      setFieldErrors(errors)
      if (Object.values(errors).some(Boolean)) return
    }
    if (!app) {
      setMessageTone('error')
      setMessage('Application was not found. Use the public application id shown in Identity OS, for example app_xxxxx.')
      return
    }
    if (!callbackUri) {
      setMessageTone('error')
      setMessage('Redirect URI is missing for this application.')
      return
    }
    const missing = fields.find((field) => field.required && !String(formValues[field.name] || '').trim())
    if (missing) {
      setMessageTone('error')
      setMessage(`${missing.label || missing.name} is required.`)
      return
    }
    const unverified = otpFields.find((field) => {
      const value = String(formValues[field.name] || '').trim()
      const state = otpState[field.name]
      return value && (!state?.verified || state.value !== value)
    })
    if (unverified) {
      setMessageTone('error')
      setMessage(`Verify ${unverified.label || unverified.name} before registration.`)
      return
    }
    if (currentMode === 'register' && consentRequired && !consentGrantedForCurrentPrincipal) {
      setMessageTone('error')
      setMessage('Give consent for the PII fields before registration.')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const submittedFields = buildIdentityFieldsPayload(fields, formValues)
      const username = submittedFields.username || submittedFields.email || submittedFields.mobile || ''

      if (currentMode === 'register') {
        const verificationStatus = otpFields.reduce<Record<string, { verified: boolean; method: string; verifiedAt?: string }>>((acc, field) => {
          const state = otpState[field.name]
          acc[field.name] = {
            verified: Boolean(state?.verified && state.value === formValues[field.name]),
            method: 'OTP',
            verifiedAt: state?.verified ? new Date().toISOString() : undefined,
          }
          return acc
        }, {})
        await hostedIdentityRequest('/api/v1/onboarding/identity/register', {
          clientId,
          redirectUri: callbackUri,
          fields: submittedFields,
          verificationStatus,
        })
        setFormValues({})
        setFieldErrors({})
        setVisiblePasswords({})
        setOtpState({})
        setConsentGranted(false)
        setConsentPrincipal('')
        setMessageTone('success')
        setMessage(completionPurpose === 'complete_profile'
          ? 'Profile completed successfully. Your trust score can now be refreshed.'
          : 'Registration completed successfully. You can now login with this username and password.')
        if (returnUrl) {
          window.location.href = returnUrl
          return
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      const tokenResponse = await hostedIdentityRequest('/api/v1/onboarding/identity/login', {
        clientId,
        redirectUri: callbackUri,
        fields: submittedFields,
      })
      redirectWithParams(callbackUri, {
        access_token: tokenResponse.accessToken,
        token_type: tokenResponse.tokenType || 'Bearer',
        client_id: clientId,
        username,
      })
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Identity OS request failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!queryReady || !configurationReady) return <div className="hosted-identity-shell hosted-auth-shell"><div className="hosted-card hosted-auth-card"><p>Loading Identity OS configuration...</p></div></div>

  if (activeNotice) return <RegistrationNotice notice={activeNotice} onClose={() => { setActiveNotice(null); window.scrollTo({ top: 0 }) }} onAccepted={principal => {
    setConsentGranted(true); setConsentPrincipal(principal); setConsentBirthDate(activeNoticeBirthDate); setActiveNotice(null); setFieldErrors({}); setConsentError('')
    setMessageTone('success'); setMessage('Your consent has been saved. Complete any pending field verification, then select Register.')
    window.scrollTo({ top: 0 })
  }} />

  if (mode === 'choice') {
    return (
      <div className="hosted-identity-shell">
        <section className="hosted-card hosted-choice-card">
          <span className="hosted-brand"><AdminIcon name="shield" />Identity OS</span>
          <h1>{app?.name || 'Choose Identity Flow'}</h1>
          <p>This request includes a client id, but no flow. Choose whether the user clicked Register or Login.</p>
          <div className="hosted-actions">
            <a className="primary-button" href={`/identity/register?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUri)}`}>Open Registration</a>
            <a className="secondary-button" href={`/identity/login?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUri)}`}>Open Login</a>
          </div>
          {!app && <div className="hosted-warning">Application not found for client id <code>{clientId || '-'}</code>.</div>}
        </section>
      </div>
    )
  }

  return (
    <div className={`hosted-identity-shell hosted-auth-shell hosted-split-shell${currentMode === 'login' ? ' is-login' : ''}`}>
      <aside className="hosted-auth-art" aria-label="Identity OS introduction">
        <div className="hosted-art-orbit hosted-art-orbit-one" aria-hidden="true" /><div className="hosted-art-orbit hosted-art-orbit-two" aria-hidden="true" />
        <div className="hosted-art-content"><span className="hosted-art-eyebrow"><Sparkles size={16} aria-hidden="true" />IDENTITY OS</span><div className="hosted-art-symbol" aria-hidden="true"><Fingerprint size={88} strokeWidth={1} /></div>
          <h2>{currentMode === 'login' ? 'Welcome back.\nPick up where you left off.' : 'Your next chapter\nstarts here.'}</h2>
          <p>{currentMode === 'login' ? 'Sign in to your account and continue to your application.' : 'Create your account with clear choices about how your personal information is used.'}</p>
          <div className="hosted-art-note"><ShieldCheck size={20} aria-hidden="true" /><span>Your identity. Your choices.</span></div>
        </div>
      </aside>
      <section className="hosted-card hosted-auth-card">
        <div className="hosted-header">
          <span className="hosted-brand"><AdminIcon name="shield" />Identity OS</span>
          <span className="status-pill-ui status-approved">{app?.status || 'unknown'}</span>
        </div>
        <div className="hosted-app-summary">
          <span className="hosted-app-icon">{(app?.name || 'A').charAt(0).toUpperCase()}</span>
          <div><h1>{currentMode === 'register' ? 'Create account' : 'Sign in'}</h1><p>{app?.name || 'Unknown application'}</p></div>
        </div>
        {!app && <div className="hosted-warning">Application not found. Use application id like <code>app_xxxxx</code>, or keep the generated client id available in Identity OS state.</div>}
        {app && app.status !== 'approved' && <div className="hosted-warning">This application is not active yet.</div>}
        {app && currentMode === 'register' && !registrationSchema && <div className="hosted-warning">No published registration schema found for this application. Ask the organization admin to publish a registration schema.</div>}
        {app && currentMode === 'login' && !loginSchema && <div className="hosted-warning">No published login configuration found for this application. Ask the organization admin to publish a login configuration.</div>}
        {fieldsMissing && <div className="hosted-warning">Login configuration does not define renderable fields. Re-submit this login configuration so Identity OS stores loginFields for this application.</div>}
        {message && <div className={messageTone === 'success' ? 'hosted-success' : 'hosted-error'}>{message}</div>}
        <form className="hosted-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
          {fields.map((field) => {
            const kind = hostedFieldKind(field)
            const inputId = `hosted-field-${field.name}`
            const input = <input
              id={inputId}
              type={kind === 'password' ? visiblePasswords[field.name] ? 'text' : 'password' : kind === 'date' ? 'date' : kind === 'email' ? 'email' : kind === 'mobile' ? 'tel' : 'text'}
              inputMode={kind === 'aadhaar' || kind === 'mobile' ? 'numeric' : undefined}
              minLength={kind === 'aadhaar' ? 12 : kind === 'mobile' ? 10 : undefined}
              maxLength={kind === 'aadhaar' ? 12 : kind === 'mobile' ? 10 : undefined}
              pattern={kind === 'aadhaar' ? '[0-9]{12}' : kind === 'mobile' ? '[0-9]{10}' : undefined}
              max={kind === 'date' ? localDateToday() : undefined}
              required={currentMode === 'register' && field.required}
              autoComplete={kind === 'password' ? currentMode === 'register' ? 'new-password' : 'current-password' : kind === 'email' ? 'email' : kind === 'mobile' ? 'tel-national' : kind === 'date' ? 'bday' : undefined}
              value={formValues[field.name] || ''}
              aria-invalid={Boolean(fieldErrors[field.name])}
              aria-describedby={[fieldErrors[field.name] ? `${inputId}-error` : '', minorRegistration && field.name === birthField?.name ? `${inputId}-minor` : ''].filter(Boolean).join(' ') || undefined}
              onBlur={() => { if (currentMode === 'register' && (formValues[field.name] || fieldErrors[field.name])) setFieldErrors(prev => ({ ...prev, [field.name]: hostedFieldError(field, formValues[field.name] || '') })) }}
              onChange={(event) => updateField(field.name, event.target.value)}
              placeholder={field.label || field.name}
            />
            return <div className="hosted-field" key={field.name}>
              <label htmlFor={inputId}>{field.label || field.name}</label>
              {field.type === 'dropdown'
                ? <select id={inputId} value={formValues[field.name] || ''} onChange={(event) => updateField(field.name, event.target.value)}><option value="">Select {field.label || field.name}</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
                : field.type === 'checkbox'
                  ? <input id={inputId} type="checkbox" checked={formValues[field.name] === 'true'} onChange={(event) => updateField(field.name, String(event.target.checked))} />
                  : requiresOtpVerification(field) && currentMode === 'register'
                    ? <div className="hosted-verify-field">
                        <div className="hosted-verify-input-row">
                          {input}
                          <button type="button" disabled={otpState[field.name]?.sending} className={otpState[field.name]?.verified && otpState[field.name]?.value === formValues[field.name] ? 'hosted-verify-button verified' : 'hosted-verify-button'} onClick={() => sendDummyOtp(field)}>{otpState[field.name]?.verified && otpState[field.name]?.value === formValues[field.name] ? 'Verified' : otpState[field.name]?.sending ? 'Sending...' : 'Verify'}</button>
                        </div>
                        {otpState[field.name]?.sent && !(otpState[field.name]?.verified && otpState[field.name]?.value === formValues[field.name]) && <div className="hosted-otp-row">
                          <input inputMode="numeric" maxLength={6} value={otpState[field.name]?.otp || ''} onChange={(event) => setOtpState((prev) => ({ ...prev, [field.name]: { ...(prev[field.name] || {}), otp: event.target.value.replace(/\D/g, '').slice(0, 6) } }))} placeholder="Enter OTP" />
                          <button type="button" disabled={otpState[field.name]?.verifying} className="hosted-otp-button" onClick={() => verifyDummyOtp(field)}>{otpState[field.name]?.verifying ? 'Verifying...' : 'Submit OTP'}</button>
                        </div>}
                        {otpState[field.name]?.verified && otpState[field.name]?.value === formValues[field.name] && <small className="hosted-verified-note">Verified with OTP</small>}
                      </div>
                    : kind === 'password' ? <div className="hosted-password-field">{input}<button type="button" className="hosted-password-toggle" aria-label={`${visiblePasswords[field.name] ? 'Hide' : 'Show'} ${field.label || field.name}`} title={visiblePasswords[field.name] ? 'Hide password' : 'Show password'} aria-controls={inputId} aria-pressed={!!visiblePasswords[field.name]} onClick={() => setVisiblePasswords(prev => ({ ...prev, [field.name]: !prev[field.name] }))}>{visiblePasswords[field.name] ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></div> : input}
              {fieldErrors[field.name] && <small id={`${inputId}-error`} className="hosted-field-error" role="alert">{fieldErrors[field.name]}</small>}
              {minorRegistration && field.name === birthField?.name && <small id={`${inputId}-minor`} className="hosted-minor-notice" role="status">This is a minor application. Parent / guardian consent will be requested when you select “Click here”.</small>}
            </div>
          })}
          {currentMode === 'register' && consentRequired && <div className={`${consentGrantedForCurrentPrincipal ? 'hosted-success' : 'hosted-warning'} hosted-consent-panel`}>
            <span>{consentGrantedForCurrentPrincipal ? 'Consent saved.' : <>{minorRegistration ? "A parent or guardian must consent to the use of the child's personal data." : 'I consent to the collection and processing of my personal data for the stated purpose.'}{' '}<button type="button" className="hosted-consent-link" disabled={consentSubmitting} onClick={giveConsent}>{consentSubmitting ? 'Opening notice...' : 'Click here'}</button></>}</span>
            {consentError && <p className="hosted-field-error" role="alert">{consentError}</p>}
          </div>}
          {currentMode === 'register' && pendingOtpFields.length > 0 && <div id="hosted-registration-verification" className="hosted-verification-help" role="status" aria-live="polite">
            <strong>Complete verification before registering:</strong>
            <ul>{pendingOtpFields.map(field => <li key={field.name}><a href={`#hosted-field-${field.name}`}>{field.label || field.name}</a></li>)}</ul>
            <p>Select Verify, enter the code, then select Submit OTP.</p>
          </div>}
          <button className="primary-button hosted-submit" aria-describedby={currentMode === 'register' && pendingOtpFields.length > 0 ? 'hosted-registration-verification' : undefined} disabled={submitting || consentSubmitting || !app || app.status !== 'approved' || schemaMissing || fields.length === 0 || pendingOtpFields.length > 0 || (currentMode === 'register' && consentRequired && !consentGrantedForCurrentPrincipal)}>{submitting ? 'Processing...' : currentMode === 'register' ? 'Register' : 'Login and return'}</button>
        </form>
        {clientId && callbackUri && <div className="hosted-auth-switch">
          {currentMode === 'register' ? 'Already registered?' : 'Need an account?'} <a href={authSwitchUrl} onClick={switchHostedMode}>{currentMode === 'register' ? 'Login' : 'Register'}</a>
        </div>}
        {/* <div className="hosted-footer">Redirect URI: <code>{callbackUri || '-'}</code></div> */}
      </section>
    </div>
  )
}
