'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Info, RefreshCw, ShieldCheck } from 'lucide-react'
import { AdminIcon } from '../../../../components/ui'
import OrgSidebar from '../../components/OrgSidebar'
import OrgTopbar from '../../components/OrgTopbar'
import { useCatalogue } from '../../context/CatalogueContext'
import TrustBreakdown from '../../../trust/TrustBreakdown'
import { trustRequest, TrustRequestError, type TrustScore } from '../../../trust/api'

interface IdentityUserRow {
  id: string
  applicationId: string
  applicationName?: string
  externalUserId?: string
  username: string
  subjectId?: string
  email?: string
  emailVerified?: boolean
  mobileNumber?: string
  mobileVerified?: boolean
  firstName?: string
  lastName?: string
  status?: string
  source?: string
  createdAt?: string
}


const displayUserName = (user: IdentityUserRow) => {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return fullName || user.username || user.email || user.externalUserId || user.id
}

const trustClass = (level?: string) => {
  const normalized = (level || '').toLowerCase()
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  if (normalized === 'low') return 'low'
  if (normalized === 'critical') return 'critical'
  return 'unknown'
}

const scoreKey = (user: IdentityUserRow) => `${user.applicationId}:${user.subjectId || user.id}`

type ScoreProblem = { kind: 'not-evaluated' | 'identity' | 'configuration' | 'authentication' | 'service'; message: string }

const scoreProblem = (failure: unknown, lookup = false): ScoreProblem => {
  const message = failure instanceof Error ? failure.message : 'Unable to reach the trust service. Try again.'
  if (failure instanceof TrustRequestError) {
    if (lookup && failure.status === 404) return { kind: 'not-evaluated', message: 'No saved evaluation exists for this user yet. Calculate a score using the available security evidence.' }
    if (failure.status === 409) return { kind: 'configuration', message }
    if (failure.status === 401 || failure.status === 403) return { kind: 'authentication', message: `Your administrator session could not access this trust score. ${message}` }
  }
  return { kind: 'service', message }
}

const USERS_PER_PAGE = 7

export default function OrganizationUsersPage() {
  const { applications, currentOrg, orgLoginId, refreshCatalogueData } = useCatalogue()
  const [users, setUsers] = useState<IdentityUserRow[]>([])
  const [scores, setScores] = useState<Record<string, TrustScore>>({})
  const [scoreProblems, setScoreProblems] = useState<Record<string, ScoreProblem>>({})
  const [evaluatingUserKey, setEvaluatingUserKey] = useState('')
  const [revision, setRevision] = useState(0)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userPage, setUserPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const orgId = currentOrg?.id || orgLoginId
  const selectedUser = users.find((user) => user.id === selectedUserId) || users[0] || null
  const selectedScore = selectedUser ? scores[scoreKey(selectedUser)] : null
  const selectedProblem = selectedUser ? scoreProblems[scoreKey(selectedUser)] : null
  const scoredUsers = users.map((user) => ({ user, score: scores[scoreKey(user)] })).filter((item) => item.score)
  const averageScore = scoredUsers.length
    ? Math.round(scoredUsers.reduce((total, item) => total + item.score.finalScore, 0) / scoredUsers.length)
    : 0
  const attentionCount = scoredUsers.filter((item) => ['STEP_UP_AUTHENTICATION', 'MANUAL_REVIEW', 'DENY', 'INCOMPLETE'].includes(item.score.decision)).length
  const totalUserPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE))
  const currentUserPage = Math.min(userPage, totalUserPages - 1)
  const visibleUsers = users.slice(currentUserPage * USERS_PER_PAGE, currentUserPage * USERS_PER_PAGE + USERS_PER_PAGE)
  const firstVisibleUser = users.length ? currentUserPage * USERS_PER_PAGE + 1 : 0
  const lastVisibleUser = Math.min(users.length, (currentUserPage + 1) * USERS_PER_PAGE)
  const appNameById = useMemo(() => Object.fromEntries(applications.map((app: any) => [app.id, app.name])), [applications])

  useEffect(() => {
    refreshCatalogueData?.()
  }, [])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false

    const loadUsers = async () => {
      setLoading(true)
      setError('')
      setScoreProblems({})
      setScores({})
      try {
        const userResponse = await fetch(`/api/catalogue/api/v1/onboarding/organizations/${encodeURIComponent(orgId)}/identity-users`, { cache: 'no-store' })
        if (!userResponse.ok) throw new Error(await userResponse.text() || 'Unable to load users.')
        const nextUsers = await userResponse.json() as IdentityUserRow[]
        if (cancelled) return
        setUsers(nextUsers)
        setSelectedUserId((current) => current || nextUsers[0]?.id || '')
        setUserPage(0)

        const entries = await Promise.all(nextUsers.map(async (user) => {
          const key = scoreKey(user)
          const subjectId = user.subjectId
          if (!subjectId || !user.applicationId) return { key, problem: { kind: 'identity', message: 'This account does not have the identity or application link needed to calculate trust. Refresh after the account has been linked.' } as ScoreProblem }
          const query = new URLSearchParams()
          query.set('organizationId', orgId)
          if (user.applicationId) query.set('applicationId', user.applicationId)
          try { return { key, score: await trustRequest<TrustScore>(`/api/v1/trust/users/${encodeURIComponent(subjectId)}?${query.toString()}`) } }
          catch (failure) { return { key, problem: scoreProblem(failure, true) } }
        }))
        if (!cancelled) {
          setScores(Object.fromEntries(entries.filter(entry => entry.score).map(entry => [entry.key, entry.score!])))
          setScoreProblems(Object.fromEntries(entries.filter(entry => entry.problem).map(entry => [entry.key, entry.problem!])))
        }
      } catch (exception) {
        if (!cancelled) {
          setError(exception instanceof Error ? exception.message : 'Unable to load user trust scores.')
          setUsers([])
          setScores({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadUsers()
    return () => {
      cancelled = true
    }
  }, [orgId, revision])

  async function evaluateSelectedUser() {
    if (!selectedUser?.subjectId || !selectedUser.applicationId || !orgId || evaluatingUserKey) return
    const key = scoreKey(selectedUser)
    setEvaluatingUserKey(key)
    setScoreProblems(previous => { const next = { ...previous }; delete next[key]; return next })
    try {
      const result = await trustRequest<TrustScore>('/api/v1/trust/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          subjectType: 'USER', subjectId: selectedUser.subjectId, organizationId: orgId,
          applicationId: selectedUser.applicationId,
          // The server resolves this identity's latest active application session from Keycloak.
          sessionId: null,
        }),
      })
      setScores(previous => ({ ...previous, [key]: result }))
    } catch (failure) {
      setScoreProblems(previous => ({ ...previous, [key]: scoreProblem(failure) }))
    } finally { setEvaluatingUserKey('') }
  }

  return (
    <div className="org-dashboard-shell org-console-shell">
      <OrgSidebar activeItem="All Users Details" />
      <main className="org-main org-console-main org-users-main">
        <OrgTopbar heading={`Users - ${currentOrg?.name || orgId || 'Organization'}`} subtitle="Trust score and identity assurance for registered users." action={<button type="button" className="secondary-button" disabled={loading || !!evaluatingUserKey} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh</button>} />
        <section className="org-console-content org-users-content">
          <section className="org-users-kpi-grid">
            <article className="org-widget-card blue"><span><AdminIcon name="identity" /></span><strong>{users.length}</strong><label>Registered Users</label><small>{scoredUsers.length} evaluated</small></article>
            <article className="org-widget-card green"><span><AdminIcon name="check" /></span><strong>{scoredUsers.length ? averageScore : '-'}</strong><label>Average Trust</label><small>evaluated organization users</small></article>
            <article className="org-widget-card orange"><span><AdminIcon name="auth" /></span><strong>{attentionCount}</strong><label>Attention Required</label><small>step-up, restricted or incomplete</small></article>
          </section>

          <section className="org-users-layout">
            <article className="org-chart-panel user-list-panel">
              <div className="panel-heading"><h3>Registered Users</h3><span>{loading ? 'Loading...' : `${users.length} total`}</span></div>
              {error && <div className="empty-state">{error}</div>}
              {!error && !users.length && <div className="empty-state">{loading ? 'Loading users...' : 'No registered users found.'}</div>}
              <div className="org-user-list">
                {visibleUsers.map((user) => {
                  const score = scores[scoreKey(user)]
                  const level = trustClass(score?.trustLevel)
                  return (
                    <button type="button" key={user.id} className={`org-user-row ${selectedUser?.id === user.id ? 'active' : ''}`} onClick={() => setSelectedUserId(user.id)}>
                      <span className="org-user-avatar">{displayUserName(user).slice(0, 1).toUpperCase()}</span>
                      <span className="org-user-copy">
                        <strong>{displayUserName(user)}</strong>
                        <small>{user.email || user.mobileNumber || user.username}</small>
                      </span>
                      <span className={`org-user-score ${level}`} title={score ? score.decision.replaceAll('_', ' ') : scoreProblems[scoreKey(user)]?.message || 'Loading evaluation'}>{score ? Math.round(score.finalScore) : '-'}</span>
                    </button>
                  )
                })}
              </div>
              {users.length > USERS_PER_PAGE && (
                <div className="org-user-pagination">
                  <span>{firstVisibleUser}-{lastVisibleUser} of {users.length}</span>
                  <div>
                    <button type="button" aria-label="Previous users" disabled={currentUserPage === 0} onClick={() => setUserPage((page) => Math.max(0, page - 1))}>{'<'}</button>
                    <button type="button" aria-label="Next users" disabled={currentUserPage >= totalUserPages - 1} onClick={() => setUserPage((page) => Math.min(totalUserPages - 1, page + 1))}>{'>'}</button>
                  </div>
                </div>
              )}
            </article>

            <article className="org-chart-panel trust-detail-panel">
              <div className="panel-heading">
                <h3>Trust Score Distribution</h3>
                <span>{selectedScore?.decision?.replaceAll('_', ' ') || (selectedProblem && selectedProblem.kind !== 'not-evaluated' ? 'Score unavailable' : loading ? 'Loading...' : 'Not evaluated')}</span>
              </div>
              {!selectedUser && <div className="empty-state">Select a user to view trust distribution.</div>}
              {selectedUser && (
                <>
                  <div className="trust-user-profile">
                    <span className="org-user-avatar large">{displayUserName(selectedUser).slice(0, 1).toUpperCase()}</span>
                    <div>
                      <h3>{displayUserName(selectedUser)}</h3>
                      <p>{selectedUser.email || selectedUser.mobileNumber || selectedUser.username}</p>
                      <small>{selectedUser.applicationName || appNameById[selectedUser.applicationId] || selectedUser.applicationId}</small>
                    </div>
                    <strong className={`trust-total ${trustClass(selectedScore?.trustLevel)}`}>{selectedScore ? Math.round(selectedScore.finalScore) : '-'}</strong>
                  </div>

                  <div className="trust-user-evaluate">
                    <div><h4>{selectedScore ? 'Update this evaluation' : 'Calculate trust score'}</h4><p>Check this user’s account and latest active application session in Keycloak, then refresh evidence from connected providers.</p></div>
                    <button type="button" className="primary-button" disabled={loading || !!evaluatingUserKey || !selectedUser.subjectId || !selectedUser.applicationId} onClick={() => void evaluateSelectedUser()}><ShieldCheck size={16} aria-hidden="true" />{evaluatingUserKey === scoreKey(selectedUser) ? 'Evaluating...' : selectedScore ? 'Re-evaluate trust' : 'Evaluate trust'}</button>
                  </div>
                  {selectedProblem && <div className={`trust-user-message ${selectedProblem.kind === 'not-evaluated' ? 'is-info' : 'is-error'}`} role={selectedProblem.kind === 'not-evaluated' ? 'status' : 'alert'}><Info size={17} aria-hidden="true" /><div><p>{selectedProblem.message}</p>{selectedProblem.kind === 'configuration' && <Link href="/organization/trust-configuration">Create and publish a trust configuration</Link>}</div></div>}
                  {!selectedScore && !selectedProblem && !loading && !evaluatingUserKey && <p className="trust-user-empty">Registration creates the user account. Select Evaluate trust to calculate and save this user's score.</p>}
                  {!!selectedScore && !selectedScore.sessionId && <p className="trust-user-empty">No application session was resolved. Ask this user to log in, then re-evaluate. If they are already logged in, check the Keycloak evidence-reader configuration.</p>}
                  {selectedScore && <TrustBreakdown score={selectedScore} />}

                  {selectedScore && <div className="trust-reason-panel">
                    <h4>Why this score?</h4>
                    {selectedScore?.reasons?.length ? (
                      <div className="trust-reason-list">
                        {selectedScore.reasons.map((reason, index) => <span key={`${reason}-${index}`}>{reason}</span>)}
                      </div>
                    ) : (
                      <p>This evaluation did not return any reason codes.</p>
                    )}
                  </div>}
                </>
              )}
            </article>
          </section>
        </section>
      </main>
    </div>
  )
}
