'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminIcon } from '../../../../components/ui'
import OrgSidebar from '../../components/OrgSidebar'
import OrgTopbar from '../../components/OrgTopbar'
import { useCatalogue } from '../../context/CatalogueContext'

interface IdentityUserRow {
  id: string
  applicationId: string
  applicationName?: string
  externalUserId?: string
  username: string
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

interface TrustScore {
  subjectId: string
  applicationId?: string
  identityScore: number
  behaviourScore: number
  riskPenalty: number
  finalScore: number
  trustLevel: string
  decision: string
  reasons: string[]
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
  return 'critical'
}

const scoreKey = (user: IdentityUserRow) => `${user.applicationId}:${user.username || user.email || user.externalUserId}`

const percent = (value: number) => Math.max(0, Math.min(100, Math.round(Math.abs(value))))
const USERS_PER_PAGE = 7

export default function OrganizationUsersPage() {
  const { applications, currentOrg, orgLoginId, refreshCatalogueData } = useCatalogue()
  const [users, setUsers] = useState<IdentityUserRow[]>([])
  const [scores, setScores] = useState<Record<string, TrustScore>>({})
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userPage, setUserPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const orgId = currentOrg?.id || orgLoginId
  const selectedUser = users.find((user) => user.id === selectedUserId) || users[0] || null
  const selectedScore = selectedUser ? scores[scoreKey(selectedUser)] : null
  const scoredUsers = users.map((user) => ({ user, score: scores[scoreKey(user)] })).filter((item) => item.score)
  const averageScore = scoredUsers.length
    ? Math.round(scoredUsers.reduce((total, item) => total + item.score.finalScore, 0) / scoredUsers.length)
    : 0
  const stepUpCount = scoredUsers.filter((item) => ['STEP_UP_AUTHENTICATION', 'MANUAL_REVIEW', 'DENY'].includes(item.score.decision)).length
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
      try {
        const userResponse = await fetch(`/api/catalogue/api/v1/onboarding/organizations/${encodeURIComponent(orgId)}/identity-users`, { cache: 'no-store' })
        if (!userResponse.ok) throw new Error(await userResponse.text() || 'Unable to load users.')
        const nextUsers = await userResponse.json() as IdentityUserRow[]
        if (cancelled) return
        setUsers(nextUsers)
        setSelectedUserId((current) => current || nextUsers[0]?.id || '')
        setUserPage(0)

        const entries = await Promise.all(nextUsers.map(async (user) => {
          const subjectId = user.username || user.email || user.externalUserId
          if (!subjectId) return null
          const query = new URLSearchParams()
          query.set('organizationId', orgId)
          if (user.applicationId) query.set('applicationId', user.applicationId)
          const scoreResponse = await fetch(`/api/catalogue/api/v1/trust/users/${encodeURIComponent(subjectId)}?${query.toString()}`, { cache: 'no-store' })
          if (!scoreResponse.ok) return null
          const score = await scoreResponse.json() as TrustScore
          return [scoreKey(user), score] as const
        }))
        if (!cancelled) setScores(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, TrustScore]>))
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
  }, [orgId])

  return (
    <div className="org-dashboard-shell org-console-shell">
      <OrgSidebar activeItem="Users" />
      <main className="org-main org-console-main org-users-main">
        <OrgTopbar heading={`Users - ${currentOrg?.name || orgId || 'Organization'}`} subtitle="Trust score and identity assurance for registered users." />
        <section className="org-console-content org-users-content">
          <section className="org-users-kpi-grid">
            <article className="org-widget-card blue"><span><AdminIcon name="identity" /></span><strong>{users.length}</strong><label>Registered Users</label><small>{scoredUsers.length} evaluated</small></article>
            <article className="org-widget-card green"><span><AdminIcon name="check" /></span><strong>{averageScore || '-'}</strong><label>Average Trust</label><small>organization users</small></article>
            <article className="org-widget-card orange"><span><AdminIcon name="auth" /></span><strong>{stepUpCount}</strong><label>Step-up Required</label><small>manual/risk decisions</small></article>
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
                      <span className={`org-user-score ${level}`}>{score ? Math.round(score.finalScore) : '-'}</span>
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
                <span>{selectedScore?.decision?.replaceAll('_', ' ') || 'Not evaluated'}</span>
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

                  <div className="trust-distribution-list">
                    <div className="trust-distribution-row">
                      <span>Identity Score</span>
                      <div><i className="identity" style={{ width: `${percent(selectedScore?.identityScore || 0)}%` }} /></div>
                      <strong>{selectedScore?.identityScore ?? '-'}</strong>
                    </div>
                    <div className="trust-distribution-row">
                      <span>Behaviour Score</span>
                      <div><i className="behaviour" style={{ width: `${percent(selectedScore?.behaviourScore || 0)}%` }} /></div>
                      <strong>{selectedScore?.behaviourScore ?? '-'}</strong>
                    </div>
                    <div className="trust-distribution-row">
                      <span>Risk Penalty</span>
                      <div><i className="risk" style={{ width: `${percent(selectedScore?.riskPenalty || 0)}%` }} /></div>
                      <strong>{selectedScore?.riskPenalty ?? '-'}</strong>
                    </div>
                  </div>

                  <div className="trust-reason-panel">
                    <h4>Why this score?</h4>
                    {selectedScore?.reasons?.length ? (
                      <div className="trust-reason-list">
                        {selectedScore.reasons.map((reason, index) => <span key={`${reason}-${index}`}>{reason}</span>)}
                      </div>
                    ) : (
                      <p>No trust signal has been recorded for this user yet.</p>
                    )}
                  </div>
                </>
              )}
            </article>
          </section>
        </section>
      </main>
    </div>
  )
}
