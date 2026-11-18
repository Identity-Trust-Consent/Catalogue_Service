'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { AdminIcon } from '../../../components/ui'
import TrustBreakdown from '../../trust/TrustBreakdown'
import { trustClaims, trustRequest, trustToken, type TrustScore } from '../../trust/api'

interface HostedTrustScorePageProps {
  initialClientId?: string
  initialUsername?: string
}

interface HostedApplication {
  id: string
  applicationId?: string
  clientId?: string
  name?: string
  redirectUri?: string
  organizationId?: string
  orgId?: string
}


const normalizeApp = (app: any): HostedApplication => ({
  id: app.applicationId || app.clientId || app.application_id || app.id || '',
  applicationId: app.applicationId || app.application_id || app.clientId || app.client_id || '',
  clientId: app.clientId || app.client_id || app.id || '',
  name: app.name || app.applicationName || 'Connected application',
  redirectUri: app.redirectUri || app.redirect_uri || '',
  organizationId: app.organizationId || app.organization_id || app.orgId || app.org_id || '',
  orgId: app.orgId || app.organizationId || app.organization_id || '',
})


const trustClass = (level?: string) => {
  const normalized = (level || '').toLowerCase()
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  if (normalized === 'low') return 'low'
  return 'critical'
}

const formatLabel = (value?: string) =>
  value ? value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not available'

const resolveReturnUrl = (value: string | null) => {
  if (!value) return ''

  try {
    const url = new URL(value, window.location.origin)
    const isTrustScorePage = url.pathname.replace(/\/$/, '') === '/identity/trust-score'
    if (isTrustScorePage) return ''
    return url.toString()
  } catch {
    return ''
  }
}

const needsProfileCompletion = (score: TrustScore | null) => {
  return !!score?.reasons?.some(reason => reason.startsWith('PROFILE_') && !reason.endsWith('_PASSED'))
}

export default function HostedTrustScorePage({ initialClientId = '', initialUsername = '' }: HostedTrustScorePageProps) {
  const [clientId, setClientId] = useState(initialClientId)
  const [username, setUsername] = useState(initialUsername)
  const [returnUrl, setReturnUrl] = useState('')
  const [app, setApp] = useState<HostedApplication | null>(null)
  const [score, setScore] = useState<TrustScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const closeTrustScore = useCallback(() => {
    if (returnUrl) {
      window.location.assign(returnUrl)
      return
    }

    if (window.opener && !window.opener.closed) {
      window.close()
      return
    }

    if (window.history.length > 1) {
      window.history.back()
      return
    }

    window.location.assign('/')
  }, [returnUrl])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setClientId(initialClientId || params.get('client_id') || '')
    setUsername(initialUsername || params.get('username') || '')
    setReturnUrl(resolveReturnUrl(params.get('return_url')))
  }, [initialClientId, initialUsername])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTrustScore()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeTrustScore])

  useEffect(() => {
    let cancelled = false

    const loadTrustScore = async () => {
      if (!clientId || !username) {
        setLoading(false)
        setError('Unable to identify the logged-in user or application.')
        return
      }

      setLoading(true)
      setError('')
      try {
        const appResponse = await fetch(`/api/catalogue/api/v1/onboarding/applications/client/${encodeURIComponent(clientId)}`, { cache: 'no-store' })
        const appData = appResponse.ok ? normalizeApp(await appResponse.json()) : null

        const claims = trustClaims(trustToken(true))
        if (!claims?.sub || !claims?.sid) throw new Error('Sign in again to evaluate your current authenticated session.')
        const scoreData = await trustRequest<TrustScore>('/api/v1/trust/evaluations', { method: 'POST', body: JSON.stringify({
          subjectType: 'USER', subjectId: claims.sub, organizationId: appData?.organizationId || appData?.orgId,
          applicationId: appData?.applicationId || appData?.id || clientId, sessionId: claims.sid,
        }) }, true)
        if (cancelled) return
        setApp(appData)
        setScore(scoreData)
      } catch (exception) {
        if (!cancelled) {
          setError(exception instanceof Error ? exception.message : 'Unable to load trust score.')
          setScore(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTrustScore()
    return () => {
      cancelled = true
    }
  }, [clientId, username])

  const levelClass = trustClass(score?.trustLevel)
  const userInitial = useMemo(() => (username || 'U').slice(0, 1).toUpperCase(), [username])
  const completeProfileUrl = useMemo(() => {
    if (!clientId) return ''
    const params = new URLSearchParams()
    params.set('client_id', clientId)
    if (app?.redirectUri) params.set('redirect_uri', app.redirectUri)
    if (username) params.set('username', username)
    if (typeof window !== 'undefined') params.set('return_url', window.location.href)
    params.set('purpose', 'complete_profile')
    return `/identity/complete-profile?${params.toString()}`
  }, [app?.redirectUri, clientId, username])
  const showProfileCompletion = needsProfileCompletion(score) && Boolean(completeProfileUrl)

  return (
    <div className="hosted-identity-shell trust-score-shell" onClick={closeTrustScore}>
      <section className="hosted-card trust-score-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="hosted-header">
          <span className="hosted-brand"><AdminIcon name="shield" />Identity OS</span>
          <div className="trust-score-header-actions">
            <span className={`trust-score-level ${levelClass}`}>{formatLabel(score?.trustLevel)}</span>
            <button type="button" className="trust-score-close-button" onClick={closeTrustScore} aria-label="Close trust score">
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="trust-score-hero">
          <span className="hosted-app-icon">{userInitial}</span>
          <div>
            <h1>Your Trust Score</h1>
            <p>{username || 'Logged-in user'}{app?.name ? ` - ${app.name}` : ''}</p>
          </div>
          <strong className={`trust-score-total ${levelClass}`}>{loading ? '-' : Math.round(score?.finalScore || 0)}</strong>
        </div>

        {loading && <div className="hosted-warning">Loading your latest trust score...</div>}
        {error && <div className="hosted-error">{error}</div>}

        {score && (
          <>
            <div className="trust-score-decision">
              <span>Decision</span>
              <strong>{formatLabel(score.decision)}</strong>
            </div>

            <TrustBreakdown score={score} />

            <div className="trust-reason-panel">
              <h4>Why this score?</h4>
              {score.reasons?.length ? (
                <div className="trust-reason-list">
                  {score.reasons.map((reason, index) => <span key={`${reason}-${index}`}>{reason}</span>)}
                </div>
              ) : (
                <p>No trust signal has been recorded for this user yet.</p>
              )}
            </div>

            {showProfileCompletion && (
              <div className="trust-profile-completion-panel">
                <div>
                  <h4>Improve your trust score</h4>
                  <p>Some profile checks may still be pending. Complete your Identity OS profile to verify details like email, mobile, or Aadhaar when required.</p>
                </div>
                <a className="primary-button trust-profile-completion-button" href={completeProfileUrl}>Complete profile</a>
              </div>
            )}
          </>
        )}

        <div className="hosted-actions">
          <button type="button" className="secondary-button" onClick={closeTrustScore}>Back</button>
        </div>
      </section>
    </div>
  )
}
