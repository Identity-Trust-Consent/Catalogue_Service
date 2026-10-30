'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, Clock3, FileText, Info, ExternalLink, ShieldCheck, Mail, Undo2, UserRoundCheck, MessageSquareText } from 'lucide-react'
import { AdminIcon } from '../../../components/ui'
import { hostedFieldError, localDateToday } from './hosted-field-validation'

export interface RegistrationNoticeData {
  id: string
  token: string
  status: string
  consentStatus: string | null
  dataPrincipalId: string
  forMinor?: boolean
  guardianVerificationMode?: 'DEMO_ONLY' | 'UNAVAILABLE'
  template: { name: string; code: string; version: number; grantDescription: string; organizationName: string; legalDocuments: Record<string, string> }
  activities: { id: number; name: string; description: string; purposeName: string; mandatory: boolean; userAttributeNames: string[]; consentDuration: number | null }[]
  privacy?: { contactName: string; contactEmail: string; policyUrl: string; withdrawalUrl: string; rightsUrl: string; grievanceUrl: string; boardComplaintUrl: string }
}

function consentDuration(hours: number | null) {
  if (hours == null) return 'Until the purpose is met'
  for (const [size, unit] of [[8760, 'year'], [720, 'month'], [168, 'week'], [24, 'day']] as const) {
    if (hours >= size && Number.isInteger(hours / size)) {
      const count = hours / size
      return `${count} ${unit}${count === 1 ? '' : 's'}`
    }
  }
  if (hours < 1) {
    const minutes = Math.round(hours * 60 * 100) / 100
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

export default function RegistrationNotice({ notice, onClose, onAccepted, preview = false }: { notice: RegistrationNoticeData; onClose: () => void; onAccepted?: (principal: string) => void; preview?: boolean }) {
  const [selected, setSelected] = useState<number[]>(() => notice.activities.filter(activity => activity.mandatory).map(activity => activity.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [guardian, setGuardian] = useState({ name: '', email: '', mobile: '', dateOfBirth: '', relationship: '', declaration: false, verificationMethod: 'phone', aadhaar: '', otp: '' })
  const [otpSent, setOtpSent] = useState(false)
  const [otpConfirmed, setOtpConfirmed] = useState(false)
  const [guardianReference, setGuardianReference] = useState('')
  const guardianForm = useRef<HTMLFieldSetElement>(null)
  const updateGuardian = (patch: Partial<typeof guardian>) => {
    const identifierChanged = patch.verificationMethod !== undefined || patch.mobile !== undefined || patch.aadhaar !== undefined
    setGuardian(current => ({ ...current, ...patch, ...(identifierChanged ? { otp: '' } : {}) })); setGuardianReference(''); setError('')
    if (identifierChanged) { setOtpSent(false); setOtpConfirmed(false) }
    if (patch.otp !== undefined) setOtpConfirmed(false)
  }
  const sendGuardianOtp = () => {
    const valid = guardian.verificationMethod === 'phone' ? /^\d{10}$/.test(guardian.mobile) : /^\d{12}$/.test(guardian.aadhaar)
    if (!valid) { setError(guardian.verificationMethod === 'phone' ? 'Enter a 10-digit guardian phone number.' : 'Enter a 12-digit guardian Aadhaar number.'); return }
    setOtpSent(true); setOtpConfirmed(false); setGuardian(current => ({ ...current, otp: '' })); setGuardianReference(''); setError('')
  }
  const confirmGuardianOtp = () => {
    if (guardian.otp !== '123456') { setError('Invalid demo OTP. Enter 123456.'); return }
    setOtpConfirmed(true); setError('')
  }
  const guardianDetailsValid = () => {
    const inputs = guardianForm.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')
    if (!inputs) return false
    const invalid = [...inputs].find(input => !input.checkValidity())
    if (invalid) { invalid.scrollIntoView({ block: 'center', behavior: 'smooth' }); invalid.reportValidity(); return false }
    const birthError = hostedFieldError({ name: 'dob', type: 'date', required: true }, guardian.dateOfBirth)
    if (birthError) { setError(birthError); return false }
    if (!otpSent || !otpConfirmed) { setError('Verify the guardian using phone or Aadhaar and the demo OTP 123456.'); return false }
    return true
  }
  const validateGuardian = async () => {
    const response = await fetch('/api/consent-notice', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noticeId: notice.id, token: notice.token, guardian }) })
    const result = await response.json()
    if (!response.ok || !result.reference) throw new Error(result.detail || result.message || 'Unable to validate guardian details.')
    setGuardianReference(result.reference)
    return result.reference as string
  }
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (!preview) heading.current?.focus() }, [preview])
  const acceptDisabled = !selected.length || notice.activities.some(item => item.mandatory && !selected.includes(item.id)) || Boolean(notice.forMinor && notice.guardianVerificationMode !== 'DEMO_ONLY')
  const requiredCount = notice.activities.filter(item => item.mandatory).length
  const optionalCount = notice.activities.length - requiredCount
  const documents = Object.entries(notice.template.legalDocuments || {}).filter(([, url]) => /^https?:\/\//i.test(url))
  const privacy = notice.privacy
  const contactLink = privacy?.contactEmail ? `mailto:${privacy.contactEmail}` : ''
  const withdrawalLink = privacy?.withdrawalUrl || contactLink
  const rightsLink = privacy?.rightsUrl || contactLink
  const grievanceLink = privacy?.grievanceUrl || contactLink
  const decide = async (decision: 'accepted' | 'rejected') => {
    if (preview || busy) return
    if (notice.forMinor && decision === 'accepted' && !guardianReference && !guardianDetailsValid()) return
    setBusy(true); setError('')
    try {
      const reference = notice.forMinor && decision === 'accepted' ? guardianReference || await validateGuardian() : undefined
      if (notice.forMinor && decision === 'accepted' && !reference) return
      const response = await fetch('/api/consent-notice', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noticeId: notice.id, token: notice.token, decision, selectedRuleIds: decision === 'accepted' ? selected : [], ...(reference ? { guardianReference: reference } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || result.message || 'Unable to save your consent decision.')
      if (result.consentStatus === 'accepted') onAccepted?.(result.dataPrincipalId)
      else onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save your consent decision.') }
    finally { setBusy(false) }
  }
  return <div className="hosted-identity-shell hosted-notice-shell"><section className="hosted-card hosted-notice-card" aria-labelledby="registration-notice-title" aria-busy={busy}>
    <div className="notice-topbar">
      <span className="hosted-brand"><AdminIcon name="shield" />Identity OS</span>
      <button type="button" className="notice-back" disabled={busy} onClick={onClose}><ArrowLeft size={16} aria-hidden="true" />{preview ? 'Close preview' : 'Back to registration'}</button>
    </div>
    <header className="notice-hero">
      <div className="notice-hero-icon"><ShieldCheck size={28} strokeWidth={1.7} aria-hidden="true" /></div>
      <div><span className="notice-eyebrow">Personal data & consent notice</span><h1 id="registration-notice-title" tabIndex={-1} ref={heading}>{notice.template.name}</h1>
        <div className="notice-meta"><span><Building2 size={14} aria-hidden="true" />{notice.template.organizationName}</span><span className="notice-version">Notice version {notice.template.version}</span></div>
        <p className="notice-hero-intro">Understand what information is used, why it is needed, and the choices you can make.</p>
      </div>
    </header>
    {preview && <div className="notice-preview-banner" role="note">Preview only. You can try the activity selections; no notice is issued and no consent is saved.</div>}
    <div className="notice-layout">
      <main className="notice-main">
        {notice.forMinor && <section className="notice-guardian" aria-labelledby="guardian-title">
          <span className="notice-eyebrow">Parent / guardian consent</span><h2 id="guardian-title">A parent or guardian needs to review this notice</h2>
          <p>This notice concerns the personal data of <strong>{notice.dataPrincipalId}</strong>, who is under 18 based on the provided date of birth. A parent or lawful guardian must review the purposes and make the decision on the child's behalf.</p>
          <p className="notice-guardian-demo" role="note"><strong>Demo mode — use test details only.</strong> Identity, age and guardianship are not independently verified. This is not production parental verification.</p>
          {notice.guardianVerificationMode !== 'DEMO_ONLY' ? <p role="alert">Guardian verification is unavailable. Registration cannot continue for a child until a verification method is enabled.</p> : <>
            <fieldset ref={guardianForm} disabled={busy || preview} className="notice-guardian-fields"><legend>Parent / lawful guardian details</legend>
              <label><span>Full name <span aria-hidden="true">*</span></span><input required minLength={2} maxLength={255} autoComplete="name" value={guardian.name} onChange={event => updateGuardian({ name: event.target.value })} /></label>
              <label><span>Relationship <span aria-hidden="true">*</span></span><select required value={guardian.relationship} onChange={event => updateGuardian({ relationship: event.target.value })}><option value="">Select relationship</option><option value="parent">Parent</option><option value="lawful_guardian">Lawful guardian</option></select></label>
              <label><span>Email <span aria-hidden="true">*</span></span><input required type="email" maxLength={255} autoComplete="email" value={guardian.email} onChange={event => updateGuardian({ email: event.target.value })} /></label>
              <label><span>Verify using <span aria-hidden="true">*</span></span><select value={guardian.verificationMethod} onChange={event => updateGuardian({ verificationMethod: event.target.value })}><option value="phone">Phone number</option><option value="aadhaar">Aadhaar number</option></select></label>
              {guardian.verificationMethod === 'phone'
                ? <label><span>Phone number <span aria-hidden="true">*</span></span><input required type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="tel-national" value={guardian.mobile} onChange={event => updateGuardian({ mobile: event.target.value })} /></label>
                : <label><span>Aadhaar number <span aria-hidden="true">*</span></span><input required inputMode="numeric" pattern="[0-9]{12}" minLength={12} maxLength={12} autoComplete="off" value={guardian.aadhaar} onChange={event => updateGuardian({ aadhaar: event.target.value })} /></label>}
              <div className="notice-guardian-otp"><button type="button" className="secondary-button" onClick={sendGuardianOtp}>{otpSent ? 'Resend demo OTP' : 'Send demo OTP'}</button>
                {otpSent && <><p role="status">Demo OTP: <strong>123456</strong>. No SMS is sent.</p><label>Enter OTP<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={guardian.otp} onChange={event => updateGuardian({ otp: event.target.value })} /></label><button type="button" className="secondary-button" disabled={otpConfirmed} onClick={confirmGuardianOtp}>{otpConfirmed ? 'Demo OTP verified' : 'Verify OTP'}</button></>}
              </div>
              <label><span>Date of birth <span aria-hidden="true">*</span></span><input required type="date" min="1900-01-01" max={localDateToday()} value={guardian.dateOfBirth} onChange={event => updateGuardian({ dateOfBirth: event.target.value })} /></label>
              <label className="notice-guardian-declaration"><input required type="checkbox" checked={guardian.declaration} onChange={event => updateGuardian({ declaration: event.target.checked })} /><span>I declare that I am at least 18 and am this child's parent or lawful guardian, authorised to make this decision.</span></label>
            </fieldset>
            <p>Verify either your phone or Aadhaar using the demo OTP, review the activities, then choose <strong>Agree and continue</strong>.</p>
          </>}
        </section>}
        <section className="notice-summary" aria-labelledby="notice-summary-title"><h2 id="notice-summary-title">Why we’re asking for your consent</h2><p className="notice-description">{notice.template.grantDescription}</p></section>
        <div className="notice-choice-callout"><Info size={20} aria-hidden="true" /><p><strong>Review your consent choices.</strong> {requiredCount > 0 ? 'Required activities are automatically selected and cannot be changed. Choose any optional activities you agree to, then select “I agree and continue”. You can decline the whole notice instead.' : 'No activities are selected for you. Select the activities you agree to, then choose “I agree and continue”.'}</p></div>
        <section className="notice-processing" aria-labelledby="notice-activities-title">
          <div className="notice-section-heading"><h2 id="notice-activities-title">How your information will be used</h2><span>{notice.activities.length} {notice.activities.length === 1 ? 'activity' : 'activities'}</span></div>
          <p className="notice-section-intro">Review the details below before making your choice.</p>
          <div className="notice-activities">{notice.activities.map((activity, index) => {
            const checked = selected.includes(activity.id)
            const titleId = `notice-activity-${activity.id}`
            return <article key={activity.id} className={`notice-activity${checked ? ' is-selected' : ''}`}>
              <div className="notice-activity-header">
                <input id={`${titleId}-choice`} type="checkbox" aria-labelledby={titleId} aria-describedby={`${titleId}-requirement`} checked={checked} disabled={busy || activity.mandatory} onChange={event => { if (!activity.mandatory) setSelected(current => event.target.checked ? [...current, activity.id] : current.filter(id => id !== activity.id)) }} />
                <div className="notice-activity-heading"><span className="notice-activity-number">Activity {String(index + 1).padStart(2, '0')}</span><h3 id={titleId}><label htmlFor={`${titleId}-choice`}>{activity.name}</label></h3></div>
                <span id={`${titleId}-requirement`} className={`notice-requirement${activity.mandatory ? ' is-required' : ''}`}>{activity.mandatory ? 'Required · locked' : 'Optional'}</span>
              </div>
              <div className="notice-activity-body">
                {activity.purposeName !== activity.name && <p className="notice-purpose">Purpose: {activity.purposeName}</p>}
                <p className="notice-description">{activity.description}</p>
                <div className="notice-data"><h4>Personal information used for this activity</h4><ul aria-label="Personal information used">{activity.userAttributeNames.length ? activity.userAttributeNames.map(name => <li key={name}><Check size={14} aria-hidden="true" />{name.replace(/_/g, ' ')}</li>) : <li>As described in the activity above</li>}</ul></div>
                <div className="notice-duration"><Clock3 size={18} aria-hidden="true" /><span>Consent valid for <strong title={activity.consentDuration == null ? undefined : `${activity.consentDuration} hours`}>{consentDuration(activity.consentDuration)}</strong></span></div>
              </div>
            </article>
          })}</div>
        </section>
        <section className="notice-rights" aria-labelledby="notice-rights-title">
          <div className="notice-section-heading"><h2 id="notice-rights-title">Your privacy rights & support</h2></div>
          <p className="notice-section-intro">{notice.template.organizationName} is the organisation asking to use your personal information.</p>
          <div className="notice-rights-list">
            <article><Undo2 size={21} aria-hidden="true" /><div><h3>Withdraw your consent</h3><p>You can withdraw consent after giving it. This does not change the lawfulness of processing before withdrawal. Services that depend on that consent may no longer be available.</p>{withdrawalLink && <a href={withdrawalLink}>{privacy?.withdrawalUrl ? 'Manage or withdraw consent' : 'Contact the privacy team to withdraw consent'}<ArrowRight size={15} aria-hidden="true" /></a>}</div></article>
            <article><UserRoundCheck size={21} aria-hidden="true" /><div><h3>Access, correction & erasure</h3><p>You may request information about the processing of your data, correction of inaccurate or incomplete data, and erasure, subject to applicable law. You may also nominate someone to exercise your rights in the event of death or incapacity.</p>{rightsLink && <a href={rightsLink}>Make a privacy rights request<ArrowRight size={15} aria-hidden="true" /></a>}</div></article>
            <article><MessageSquareText size={21} aria-hidden="true" /><div><h3>Raise a concern or grievance</h3><p>Raise a privacy concern with the organisation first. After exhausting its grievance process, you may approach the Data Protection Board of India as provided by applicable law.</p>{grievanceLink && <a href={grievanceLink}>Contact grievance support<ArrowRight size={15} aria-hidden="true" /></a>}{privacy?.boardComplaintUrl && <a href={privacy.boardComplaintUrl} target="_blank" rel="noopener noreferrer">Data Protection Board complaint information<ExternalLink size={15} aria-hidden="true" /></a>}</div></article>
          </div>
          {contactLink ? <div className="notice-privacy-contact"><Mail size={20} aria-hidden="true" /><div><h3>{privacy?.contactName || 'Privacy contact'}</h3><a href={contactLink}>{privacy?.contactEmail}</a></div></div> : <p className="notice-contact-missing">Privacy contact details have not been provided in this notice. Ask {notice.template.organizationName} for its authorised privacy contact and withdrawal process before giving consent.</p>}
          {privacy?.policyUrl && <a className="notice-policy-link" href={privacy.policyUrl} target="_blank" rel="noopener noreferrer">Read the privacy policy<ExternalLink size={15} aria-hidden="true" /></a>}
        </section>
        {documents.length > 0 && <section className="notice-documents" aria-labelledby="notice-documents-title"><h2 id="notice-documents-title">Related documents</h2><p>Read more about the terms that apply to your information.</p><div>{documents.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer"><FileText size={18} aria-hidden="true" /><span>{name}</span><ExternalLink size={14} aria-hidden="true" /><span className="repository-sr-only"> (opens in a new tab)</span></a>)}</div></section>}
      </main>
      <aside className="notice-aside" aria-labelledby="notice-choices-title">
        <div className="notice-guide"><span className="notice-guide-icon"><Info size={20} aria-hidden="true" /></span><h2 id="notice-choices-title">Understand your choices</h2>
          {requiredCount > 0 && <div><h3><span className="notice-guide-dot" />Required for this service</h3><p>These activities are selected automatically and cannot be unchecked. You can decline the whole notice, but registration will not continue.</p></div>}
          {optionalCount > 0 && <div><h3><span className="notice-guide-dot is-optional" />Optional means optional</h3><p>You can leave optional activities unchecked and still continue with the required activities.</p></div>}
          <div><h3>Consent period</h3><p>The period shown is how long consent lasts. It is not a promise that all data will be deleted at that time. Retention may depend on the stated purpose and applicable law.</p></div>
          <div className="notice-guide-divider" /><h3>What happens next?</h3><p>Accept to save your choices and return to registration. Your entered details will be kept.</p>
        </div>
        <p className="notice-review-note"><ShieldCheck size={16} aria-hidden="true" /><span>Your consent applies to the activities you select in this notice.</span></p>
      </aside>
    </div>
    <footer className="notice-footer">
      <div className="notice-footer-copy"><span className="notice-selection" role="status"><Check size={16} aria-hidden="true" />{selected.length} of {notice.activities.length} {notice.activities.length === 1 ? 'activity' : 'activities'} selected</span><p>{notice.forMinor ? 'By accepting in demo mode, you record these choices on behalf of the child. Guardian identity remains unverified.' : 'By accepting, you consent to the selected activities described above.'}</p></div>
      {error && <div className="hosted-error notice-decision-error" role="alert">{error}</div>}
      {acceptDisabled && <p className="notice-validation" role="status">{notice.forMinor && notice.guardianVerificationMode !== 'DEMO_ONLY' ? 'Guardian verification is unavailable.' : 'Select at least one activity and all required activities to accept.'}</p>}
      <div className="notice-footer-actions"><button type="button" className="secondary-button" disabled={preview || busy} onClick={() => decide('rejected')}>I do not agree</button><button type="button" className="primary-button" disabled={preview || busy || acceptDisabled} onClick={() => decide('accepted')}>{busy ? 'Saving your choice…' : <>{notice.forMinor ? 'Agree and continue' : 'I agree and continue'}<ArrowRight size={16} aria-hidden="true" /></>}</button></div>
    </footer>
  </section></div>
}
