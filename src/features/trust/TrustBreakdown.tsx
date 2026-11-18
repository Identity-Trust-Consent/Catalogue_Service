'use client'

import type { TrustScore } from './api'

export default function TrustBreakdown({ score }: { score: TrustScore | null }) {
  if (!score) return <p>No evaluation is available for this identity.</p>
  return <div className="trust-framework-breakdown">
    <p>Configuration v{score.configurationVersion} · {score.complete ? 'Complete' : 'Incomplete'} · {score.decision.replaceAll('_', ' ')}</p>
    <small>Evaluated {new Date(score.calculatedAt).toLocaleString()} · {score.evaluationId}</small>
    {!score.complete && <p role="status">This is a partial score. Missing or unavailable evidence contributes according to your configuration; it does not prove that the user failed those checks.</p>}
    {score.sessionId && <p className="repository-muted">Evaluated session: {score.sessionId}</p>}
    {!!score.mandatoryFailures?.length && <div role="alert" className="hosted-error">Mandatory controls: {score.mandatoryFailures.join(', ')}</div>}
    <p className="repository-muted">This score supports access decisions. Permissions and resource policy are checked separately.</p>
    {score.categories?.filter(category => category.weight > 0 || category.signals.some(signal => signal.reasonCode.includes('MANDATORY_FAILURE'))).map(category => <details key={category.code}>
      <summary>{category.name}: {Number(category.score).toFixed(2)} × {category.weight}% = {Number(category.contribution).toFixed(2)} points</summary>
      <ul>{category.signals.map(signal => <li key={signal.code}>{signal.code}: {signal.score == null ? 'Excluded' : Number(signal.score).toFixed(2)} · {signal.status} · {signal.reasonCode}</li>)}</ul>
    </details>)}
    {score.decision === 'STEP_UP_AUTHENTICATION' && <p role="status">Additional verification is required. Re-authenticate with your application’s MFA flow, then request a new evaluation.</p>}
  </div>
}
