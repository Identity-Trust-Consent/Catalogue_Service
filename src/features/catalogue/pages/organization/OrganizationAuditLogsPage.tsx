'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminIcon } from '../../../../components/ui'
import OrgSidebar from '../../components/OrgSidebar'
import OrgTopbar from '../../components/OrgTopbar'
import { useCatalogue } from '../../context/CatalogueContext'

interface AuditRecord {
  id: string
  origin?: string
  service_name?: string
  actor_user_id?: string
  actor_role?: string
  action?: string
  http_method?: string
  endpoint?: string
  entity_type?: string
  entity_id?: string
  organization_id?: string
  application_id?: string
  status?: string
  decision?: string
  request_body?: unknown
  response_body?: unknown
  metadata?: unknown
  ip_address?: string
  user_agent?: string
  occurred_at?: string
  created_at?: string
}

const formatLabel = (value?: string) =>
  value ? value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown'

const parseAuditDate = (value?: string, plainTimestampIsUtc = true) => {
  if (!value) return null
  const rawValue = String(value).trim()
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(rawValue)
  if (hasTimezone) {
    const zonedDate = new Date(rawValue)
    return Number.isNaN(zonedDate.getTime()) ? null : zonedDate
  }

  const match = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/)
  if (match) {
    const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match
    const millisecond = Number(fraction.slice(0, 3).padEnd(3, '0'))
    if (plainTimestampIsUtc) {
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), millisecond))
    }
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), millisecond)
  }

  const fallbackDate = new Date(rawValue)
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate
}

const formatDate = (value?: string, plainTimestampIsUtc = true) => {
  if (!value) return 'No timestamp'
  const date = parseAuditDate(value, plainTimestampIsUtc)
  if (!date) return value
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

const normalizeStatus = (value?: string) => {
  const status = (value || '').toLowerCase()
  if (status === 'success') return 'success'
  if (status === 'failed' || status === 'failure' || status === 'error') return 'failed'
  return 'neutral'
}

const previewJson = (value: unknown) => {
  if (!value) return '{}'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

const safeValue = (value?: string | null) => value || '-'
const AUDIT_LOGS_PER_PAGE = 10
const auditTimestamp = (record: AuditRecord) => record.created_at || record.occurred_at || ''
const formatAuditTimestamp = (record: AuditRecord) => formatDate(auditTimestamp(record), !record.created_at)
const auditMinuteKey = (record: AuditRecord) => {
  const date = parseAuditDate(auditTimestamp(record), !record.created_at)
  if (!date) return auditTimestamp(record)
  return Math.floor(date.getTime() / 60000).toString()
}

const auditDedupeKey = (record: AuditRecord) => [
  record.action || '',
  record.actor_user_id || '',
  record.actor_role || '',
  record.endpoint || '',
  record.entity_type || '',
  record.entity_id || '',
  record.organization_id || '',
  record.application_id || '',
  normalizeStatus(record.status),
  auditMinuteKey(record),
].join('|')

export default function OrganizationAuditLogsPage() {
  const { currentOrg, orgLoginId } = useCatalogue()
  const orgId = currentOrg?.id || orgLoginId
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadAuditRecords = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/catalogue/audits/records?limit=250', { cache: 'no-store' })
        if (!response.ok) throw new Error(await response.text() || 'Unable to load audit logs.')
        const data = await response.json() as AuditRecord[]
        const orgRecords = orgId ? data.filter((record) => !record.organization_id || record.organization_id === orgId) : data
        if (cancelled) return
        setRecords(orgRecords)
        setSelectedId((current) => current || orgRecords[0]?.id || '')
      } catch (exception) {
        if (!cancelled) {
          setError(exception instanceof Error ? exception.message : 'Unable to load audit logs.')
          setRecords([])
          setSelectedId('')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAuditRecords()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const uniqueRecords = useMemo(() => {
    const seen = new Set<string>()
    return records.filter((record) => {
      const key = auditDedupeKey(record)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [records])
  const services = useMemo(() => Array.from(new Set(uniqueRecords.map((record) => record.service_name).filter(Boolean) as string[])), [uniqueRecords])
  const actions = useMemo(() => Array.from(new Set(uniqueRecords.map((record) => record.action).filter(Boolean) as string[])), [uniqueRecords])
  const successCount = uniqueRecords.filter((record) => normalizeStatus(record.status) === 'success').length
  const failedCount = uniqueRecords.filter((record) => normalizeStatus(record.status) === 'failed').length

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    return uniqueRecords.filter((record) => {
      const status = normalizeStatus(record.status)
      const searchText = [
        record.action,
        record.actor_user_id,
        record.entity_id,
        record.entity_type,
        record.endpoint,
        record.service_name,
        record.status,
      ].filter(Boolean).join(' ').toLowerCase()
      return (
        (!term || searchText.includes(term)) &&
        (statusFilter === 'all' || status === statusFilter) &&
        (serviceFilter === 'all' || record.service_name === serviceFilter) &&
        (actionFilter === 'all' || record.action === actionFilter)
      )
    })
  }, [actionFilter, search, serviceFilter, statusFilter, uniqueRecords])

  const selectedRecord = filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0] || null
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / AUDIT_LOGS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const visibleRecords = filteredRecords.slice(currentPage * AUDIT_LOGS_PER_PAGE, currentPage * AUDIT_LOGS_PER_PAGE + AUDIT_LOGS_PER_PAGE)
  const firstVisibleRecord = filteredRecords.length ? currentPage * AUDIT_LOGS_PER_PAGE + 1 : 0
  const lastVisibleRecord = Math.min(filteredRecords.length, (currentPage + 1) * AUDIT_LOGS_PER_PAGE)

  useEffect(() => {
    setPage(0)
  }, [actionFilter, search, serviceFilter, statusFilter])

  return (
    <div className="org-dashboard-shell org-console-shell">
      <OrgSidebar activeItem="Audit Logs" />
      <main className="org-main org-console-main org-audit-main">
        <OrgTopbar heading={`Audit Logs - ${currentOrg?.name || orgId || 'Organization'}`} subtitle="Track identity, consent, login, and admin activity from the audit service." />
        <section className="org-console-content org-audit-content">
          <section className="org-users-kpi-grid">
            <article className="org-widget-card blue"><span><AdminIcon name="audit" /></span><strong>{uniqueRecords.length}</strong><label>Total Events</label><small>{loading ? 'loading records' : 'latest audit records'}</small></article>
            <article className="org-widget-card green"><span><AdminIcon name="check" /></span><strong>{successCount}</strong><label>Successful Events</label><small>completed operations</small></article>
            <article className="org-widget-card orange"><span><AdminIcon name="security" /></span><strong>{failedCount}</strong><label>Failed Events</label><small>needs review</small></article>
          </section>

          <section className="org-chart-panel audit-filter-panel">
            <label>
              <span>Search logs</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user, action, endpoint..." />
            </label>
            <label>
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="neutral">Other</option>
              </select>
            </label>
            <label>
              <span>Service</span>
              <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
                <option value="all">All services</option>
                {services.map((service) => <option key={service} value={service}>{service}</option>)}
              </select>
            </label>
            <label>
              <span>Action</span>
              <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">All actions</option>
                {actions.map((action) => <option key={action} value={action}>{formatLabel(action)}</option>)}
              </select>
            </label>
          </section>

          <section className="org-audit-layout">
            <article className="org-chart-panel audit-list-panel">
              <div className="panel-heading"><h3>Recent Events</h3><span>{loading ? 'Loading...' : `${filteredRecords.length} shown`}</span></div>
              {error && <div className="empty-state">{error}</div>}
              {!error && !filteredRecords.length && <div className="empty-state">{loading ? 'Loading audit logs...' : 'No audit logs matched your filters.'}</div>}
              <div className="audit-event-list">
                {visibleRecords.map((record) => {
                  const status = normalizeStatus(record.status)
                  return (
                    <button type="button" key={record.id} className={`audit-event-row ${selectedRecord?.id === record.id ? 'active' : ''}`} onClick={() => setSelectedId(record.id)}>
                      <span className={`audit-status-dot ${status}`} />
                      <span className="audit-event-copy">
                        <strong>{formatLabel(record.action)}</strong>
                        <small>{safeValue(record.actor_user_id)} - {safeValue(record.endpoint)}</small>
                      </span>
                      <span className={`audit-status-pill ${status}`}>{formatLabel(record.status)}</span>
                      <time>{formatAuditTimestamp(record)}</time>
                    </button>
                  )
                })}
              </div>
              {filteredRecords.length > AUDIT_LOGS_PER_PAGE && (
                <div className="audit-pagination">
                  <span>{firstVisibleRecord}-{lastVisibleRecord} of {filteredRecords.length}</span>
                  <div>
                    <button type="button" aria-label="Previous audit logs" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>{'<'}</button>
                    <button type="button" aria-label="Next audit logs" disabled={currentPage >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}>{'>'}</button>
                  </div>
                </div>
              )}
            </article>

            <article className="org-chart-panel audit-detail-panel">
              <div className="panel-heading">
                <h3>Event Details</h3>
                <span>{selectedRecord ? formatLabel(selectedRecord.status) : 'No event selected'}</span>
              </div>
              {!selectedRecord && <div className="empty-state">Select an audit event to inspect full details.</div>}
              {selectedRecord && (
                <>
                  <div className="audit-detail-header">
                    <span><AdminIcon name="audit" /></span>
                    <div>
                      <h3>{formatLabel(selectedRecord.action)}</h3>
                      <p>{safeValue(selectedRecord.service_name)} - {formatAuditTimestamp(selectedRecord)}</p>
                    </div>
                  </div>

                  <div className="audit-detail-grid">
                    <div><span>Actor</span><strong>{safeValue(selectedRecord.actor_user_id)}</strong></div>
                    <div><span>Role</span><strong>{safeValue(selectedRecord.actor_role)}</strong></div>
                    <div><span>Entity</span><strong>{formatLabel(selectedRecord.entity_type)} / {safeValue(selectedRecord.entity_id)}</strong></div>
                    <div><span>Method</span><strong>{safeValue(selectedRecord.http_method)}</strong></div>
                    <div><span>Endpoint</span><strong>{safeValue(selectedRecord.endpoint)}</strong></div>
                    <div><span>Application</span><strong>{safeValue(selectedRecord.application_id)}</strong></div>
                    <div><span>IP Address</span><strong>{safeValue(selectedRecord.ip_address)}</strong></div>
                    <div><span>Decision</span><strong>{formatLabel(selectedRecord.decision)}</strong></div>
                  </div>

                  <div className="audit-json-grid">
                    <div>
                      <h4>Request</h4>
                      <pre>{previewJson(selectedRecord.request_body)}</pre>
                    </div>
                    <div>
                      <h4>Response</h4>
                      <pre>{previewJson(selectedRecord.response_body)}</pre>
                    </div>
                    <div>
                      <h4>Metadata</h4>
                      <pre>{previewJson(selectedRecord.metadata)}</pre>
                    </div>
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
