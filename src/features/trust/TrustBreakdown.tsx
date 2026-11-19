'use client'

import { Activity, AlertTriangle, Check, CheckCircle2, ChevronDown, Clock3, Fingerprint, Globe, Info, Laptop, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react'
import type { TrustCategory, TrustScore, TrustSignal } from './api'

const checkNames: Record<string, string> = {
  AUTH_RESULT: 'Successful login', MFA: 'Multi-factor authentication', DEVICE_KNOWN: 'Recognised device',
  DEVICE_POSTURE: 'Device security', NETWORK_REPUTATION: 'Network reputation', LOCATION: 'Location check',
  SESSION_VALID: 'Session validity', REAUTH: 'Recent re-authentication', ACTIVITY: 'Activity check',
  BASELINE: 'Behaviour baseline', ACCOUNT_ACTIVE: 'Active account', PROFILE: 'Verified profile',
  COMPROMISE_CLEAR: 'Account compromise clearance', INCIDENTS: 'Security incident check',
}
const icons: Record<string, typeof ShieldCheck> = {
  AUTHENTICATION: Fingerprint, DEVICE: Laptop, NETWORK: Globe, SESSION: ShieldCheck,
  BEHAVIOUR: Activity, IDENTITY: UserCheck, SECURITY: ShieldAlert,
}
const label = (code: string) => checkNames[code] || code.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase())
const number = (value: number) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
const percent = (value: number) => Math.min(100, Math.max(0, Number(value) || 0))

function state(signal: TrustSignal) {
  if (signal.status === 'AVAILABLE') {
    if (signal.rawOutcome === 'FAILED' || signal.reasonCode.endsWith('_FAILED')) return { text: 'Failed', tone: 'danger', kind: 'failed' }
    if (signal.rawOutcome === 'SUCCESS' || signal.reasonCode.endsWith('_PASSED')) return { text: 'Passed', tone: 'success', kind: 'passed' }
    return { text: 'Available', tone: 'neutral', kind: 'available' }
  }
  const names: Record<string, string> = { MISSING: 'Missing evidence', UNAVAILABLE: 'Source unavailable', STALE: 'Evidence expired', INVALID: 'Invalid evidence' }
  return { text: names[signal.status] || 'Needs evidence', tone: 'warning', kind: 'unknown' }
}

function requiredMessage(code: string, signal?: TrustSignal) {
  const failed = signal && state(signal).kind === 'failed'
  if (code.startsWith('COMPROMISE_CLEAR')) return failed
    ? 'The security source reports a failed compromise check. Investigate the result before allowing access.'
    : 'A current security check has not confirmed that this account is free from compromise. Obtain valid evidence from the security source, then re-evaluate.'
  if (code.startsWith('SESSION_VALID')) return signal?.status === 'UNAVAILABLE'
    ? 'Session validity could not be checked. Check the Keycloak evidence connection, then re-evaluate.'
    : 'A valid application session has not been confirmed. Ask the user to sign in, then re-evaluate.'
  if (code.startsWith('ACCOUNT_ACTIVE')) return failed
    ? 'The account is disabled or locked. Review its status in Keycloak before re-evaluating.'
    : 'Active account status could not be confirmed. Check the Keycloak evidence connection, then re-evaluate.'
  return 'This required check needs a current passing result before access can be allowed.'
}

function Category({ category }: { category: TrustCategory }) {
  const Icon = icons[category.code] || ShieldCheck
  const passed = category.signals.filter(signal => state(signal).kind === 'passed').length
  const failed = category.signals.some(signal => state(signal).kind === 'failed')
  const unknown = category.signals.some(signal => state(signal).kind === 'unknown')
  const tone = failed ? 'danger' : unknown ? 'warning' : 'success'
  return <details className="te-category">
    <summary>
      <span className="te-category-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="te-category-copy"><strong>{category.name}</strong><span>{number(category.weight)}% of total score <span aria-hidden="true">·</span> {passed} of {category.signals.length} checks passed</span></span>
      <span className={`te-category-points is-${tone}`}><strong>{number(category.contribution)}<small> / {number(category.weight)}</small></strong><span>points earned</span></span>
      <ChevronDown className="te-chevron" size={17} aria-hidden="true" />
      <span className={`te-category-track is-${tone}`} aria-hidden="true"><span style={{ width: `${percent(category.score)}%` }} /></span>
    </summary>
    <div className="te-category-body">
      <p className="te-formula">Category score <strong>{number(category.score)}/100</strong> × weight <strong>{number(category.weight)}%</strong> = <strong>{number(category.contribution)} points</strong></p>
      <ul className="te-check-list">{category.signals.map(signal => {
        const result = state(signal)
        return <li key={signal.code}>
          <span className={`te-check-dot is-${result.tone}`} aria-hidden="true">{result.kind === 'passed' ? <Check size={12} /> : result.kind === 'failed' ? <ShieldAlert size={12} /> : <Clock3 size={12} />}</span>
          <span className="te-check-copy"><strong>{label(signal.code)}</strong><span>{signal.score == null ? 'Excluded from scoring' : `${number(signal.score)}/100 score`} · {number(signal.effectiveWeight)}% effective weight</span></span>
          <span className={`te-pill is-${result.tone}`}>{result.text}</span>
        </li>
      })}</ul>
    </div>
  </details>
}

export default function TrustBreakdown({ score }: { score: TrustScore | null }) {
  if (!score) return <p>No evaluation is available for this identity.</p>
  const signals = score.categories?.flatMap(category => category.signals) || []
  const passed = signals.filter(signal => state(signal).kind === 'passed').length
  const failed = signals.filter(signal => state(signal).kind === 'failed').length
  const unknown = signals.filter(signal => state(signal).kind === 'unknown').length
  const required = score.mandatoryFailures || []
  const confirmedFailure = required.some(reason => signals.some(signal => signal.reasonCode === reason && state(signal).kind === 'failed'))
  const evaluated = new Date(score.calculatedAt)
  const validDate = !Number.isNaN(evaluated.getTime())
  return <div className="trust-evidence-view">
    <div className="te-status-line">
      <span className={`te-pill ${score.complete ? 'is-success' : 'is-warning'}`}>{score.complete ? <CheckCircle2 size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}{score.complete ? 'Complete evaluation' : 'Partial evaluation'}</span>
      <span className="te-updated"><Clock3 size={13} aria-hidden="true" />{validDate ? <time dateTime={evaluated.toISOString()}>{evaluated.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> : 'Time unavailable'}</span>
    </div>
    {!!required.length && <section className={`te-required is-${confirmedFailure ? 'danger' : 'warning'}`} aria-label="Required checks needing attention">
      <span className="te-required-icon"><ShieldAlert size={20} aria-hidden="true" /></span>
      <div className="te-required-content"><h4>Required checks need attention <span>{required.length}</span></h4><p>Access remains denied until these checks pass.</p>
        <ul>{required.map(reason => {
          const signal = signals.find(item => item.reasonCode === reason)
          const code = signal?.code || reason.replace(/_MANDATORY_FAILURE$/, '')
          return <li key={reason}><strong>{label(code)}</strong><p>{requiredMessage(reason, signal)}</p>{signal && <span className={`te-pill is-${state(signal).tone}`}>{state(signal).text}</span>}</li>
        })}</ul>
      </div>
    </section>}
    <section className="te-breakdown-section" aria-label="Trust score calculation">
      <div className="te-section-heading"><div><h4>How this score is calculated</h4><p>Each category contributes a weighted share of the total.</p></div><span>{score.categories?.filter(category => category.weight > 0).length || 0} categories</span></div>
      <div className="te-evidence-counts" aria-label="Evidence summary">
        <span className="is-success"><CheckCircle2 size={14} aria-hidden="true" /><strong>{passed}</strong> passed</span>
        <span className="is-warning"><Clock3 size={14} aria-hidden="true" /><strong>{unknown}</strong> need evidence</span>
        {failed > 0 && <span className="is-danger"><AlertTriangle size={14} aria-hidden="true" /><strong>{failed}</strong> failed</span>}
      </div>
      {!score.complete && <p className="te-partial-note"><Info size={15} aria-hidden="true" /><span>Missing or unavailable evidence is handled by your configuration. It does not by itself mean the user failed a check.</span></p>}
      <div className="te-categories">{score.categories?.filter(category => category.weight > 0 || category.signals.some(signal => signal.reasonCode.includes('MANDATORY_FAILURE'))).map(category => <Category key={category.code} category={category} />)}</div>
    </section>
    {score.decision === 'STEP_UP_AUTHENTICATION' && <div className="te-step-up" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Additional verification is required. Complete the application's MFA or re-authentication flow, then request a new evaluation.</p></div>}
    <details className="te-metadata"><summary><Info size={15} aria-hidden="true" /><span>Evaluation details</span><ChevronDown className="te-chevron" size={16} aria-hidden="true" /></summary><div>
      <dl><div><dt>Configuration</dt><dd>Version {score.configurationVersion}</dd></div><div><dt>Access decision</dt><dd>{score.decision.replaceAll('_', ' ')}</dd></div><div><dt>Evaluation ID</dt><dd><code>{score.evaluationId}</code></dd></div><div><dt>Session ID</dt><dd><code>{score.sessionId || 'No session resolved'}</code></dd></div></dl>
      {!!score.reasons?.length && <div className="te-reason-codes"><strong>Technical reason codes</strong><ul>{score.reasons.map((reason, index) => <li key={`${reason}-${index}`}><code>{reason}</code></li>)}</ul></div>}
    </div></details>
    <p className="te-policy-note"><ShieldCheck size={14} aria-hidden="true" />Application permissions and resource policies are checked separately.</p>
  </div>
}
