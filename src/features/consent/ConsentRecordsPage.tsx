'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronDown, Copy, Eye, FileText, Filter, History, LoaderCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { CatalogueProvider } from '../catalogue/context/CatalogueContext'
import OrgSidebar from '../catalogue/components/OrgSidebar'
import OrgTopbar from '../catalogue/components/OrgTopbar'
import { RepositoryDialog } from './RepositoryForms'
import { consentAccess, consentRequest, currentConsentToken } from './api'

type Mode = 'history' | 'notices'
type Row = Record<string, any>
type Page = { items: Row[]; total: number; offset: number; limit: number; summary?: Record<string, number> }
type Filters = { searchType: string; q: string; startDate: string; endDate: string; businessProcessCodes: string[]; noticeStatus: string[]; consentStatus: string[]; view: string }
const emptyFilters = (): Filters => ({ searchType: 'data_principal_id', q: '', startDate: '', endDate: '', businessProcessCodes: [], noticeStatus: [], consentStatus: [], view: 'all' })
const emptyPage: Page = { items: [], total: 0, offset: 0, limit: 10 }
const baseUrl = (mode: Mode) => `/organization/consent/${mode === 'history' ? 'consent-history' : 'notices'}`
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
const dateText = (value: any) => value && !Number.isNaN(new Date(value).getTime()) ? dateFormat.format(new Date(value)) + ' IST' : 'Not recorded'
const statusText = (value: any) => String(value || 'pending').replace(/_/g, ' ')

function useAccess() {
  const [access, setAccess] = useState({ read: false, ready: false })
  useEffect(() => {
    const refresh = () => setAccess({ read: consentAccess(currentConsentToken()).read, ready: true })
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('storage', refresh)
    const timer = window.setInterval(refresh, 30000)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  return access
}

export default function ConsentRecordsPage({ mode, publicId }: { mode: Mode; publicId?: string }) {
  return <CatalogueProvider initialView="org-consent-repository"><RecordsScreen mode={mode} publicId={publicId} /></CatalogueProvider>
}

function RecordsScreen({ mode, publicId }: { mode: Mode; publicId?: string }) {
  const access = useAccess()
  const title = mode === 'history' ? 'Consent History' : 'Notice Details'
  return <div className="org-dashboard-shell org-console-shell repository-shell">
    <OrgSidebar activeItem="Consent Management" />
    <main className="org-main org-console-main"><OrgTopbar heading={title} />
      <section className="repository-content records-content">
        {!access.ready ? <Loading message="Checking your access" /> : !access.read ? <div className="repository-error" role="alert">Sign in with an Identity OS administrator or consent read role to view these records. <Link href="/organization">Sign in</Link></div> : publicId ? <NoticeDetail key={publicId} publicId={publicId} mode={mode} /> : <RecordsList key={mode} mode={mode} />}
      </section>
    </main>
  </div>
}

function Loading({ message = 'Loading records' }: { message?: string }) {
  return <div className="records-loading" role="status"><LoaderCircle className="ui-spin" size={20} aria-hidden="true" />{message}</div>
}

function Status({ value }: { value: any }) {
  const normalized = String(value || 'pending').toLowerCase()
  const tone = ['accepted', 'completed', 'reconsented', 'granted', 'renewed'].includes(normalized) ? 'success' : ['revoked', 'rejected', 'cancelled', 'failed'].includes(normalized) ? 'danger' : ['pending', 'expired'].includes(normalized) ? 'warning' : 'info'
  return <span className={`records-status records-status--${tone}`}>{statusText(value)}</span>
}

function CopyValue({ value, label }: { value: any; label: string }) {
  const [result, setResult] = useState('')
  const text = value == null || value === '' ? '' : String(value)
  return <span className="records-copy"><span>{text || '\u2014'}</span>{text && <button type="button" title={`Copy ${label}`} aria-label={`Copy ${label}`} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setResult(`${label} copied`) }
    catch { setResult(`Unable to copy ${label}. Select the value and copy it manually.`) }
  }}>{result.endsWith('copied') ? <Check size={13} /> : <Copy size={13} />}</button>}<span className="repository-sr-only" role="status">{result}</span></span>
}

function MultiFilter({ label, values, options, onChange }: { label: string; values: string[]; options: { value: string; label: string }[]; onChange: (values: string[]) => void }) {
  return <details className="records-filter-menu"><summary>{label}{values.length > 0 && <b>{values.length}</b>}<ChevronDown size={14} aria-hidden="true" /></summary>
    <fieldset className="records-filter-popover"><legend className="repository-sr-only">{label}</legend>{options.length ? options.map(option => <label className="repository-check" key={option.value}><input type="checkbox" checked={values.includes(option.value)} onChange={event => onChange(event.target.checked ? [...values, option.value] : values.filter(value => value !== option.value))} />{option.label}</label>) : <p>No options available.</p>}
      {values.length > 0 && <button type="button" onClick={() => onChange([])}>Clear selection</button>}
    </fieldset>
  </details>
}

function RecordsList({ mode }: { mode: Mode }) {
  const [draft, setDraft] = useState<Filters>(emptyFilters)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [searched, setSearched] = useState(true)
  const [page, setPage] = useState<Page>(emptyPage)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(10)
  const [sort, setSort] = useState('updatedAt')
  const [direction, setDirection] = useState('desc')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [optionsError, setOptionsError] = useState('')
  const [options, setOptions] = useState<{ businessProcesses: { name: string; code: string }[]; noticeStatuses: string[]; consentStatuses: string[] }>({ businessProcesses: [], noticeStatuses: [], consentStatuses: [] })
  const title = mode === 'history' ? 'Consent History' : 'Notice Details'
  useEffect(() => {
    const controller = new AbortController()
    consentRequest<typeof options>('records/options', { signal: controller.signal }).then(value => { setOptions(value); setOptionsError('') }).catch(failure => { if (!controller.signal.aborted) setOptionsError(failure.message) })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    if (!searched) return
    const controller = new AbortController()
    setLoading(true); setError('')
    const params = new URLSearchParams({ searchType: filters.searchType, q: filters.q, view: filters.view, sort, direction, offset: String(offset), limit: String(limit) })
    if (filters.startDate) params.set('startDate', filters.startDate)
    if (filters.endDate) params.set('endDate', filters.endDate)
    for (const key of ['businessProcessCodes', 'noticeStatus', 'consentStatus'] as const) filters[key].forEach(value => params.append(key, value))
    consentRequest<Page>(`${mode === 'history' ? 'history' : 'notices'}?${params}`, { signal: controller.signal }).then(setPage).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setPage(emptyPage) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, searched, offset, limit, sort, direction, revision, mode])
  const patch = (value: Partial<Filters>) => setDraft(current => ({ ...current, ...value }))
  const submit = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft }); setOffset(0); setSearched(true) }
  const reset = () => { const fresh = emptyFilters(); setDraft(fresh); setFilters(fresh); setOffset(0) }
  const consentStatuses = [...new Set(['pending', 'accepted', 'rejected', 'revoked', 'expired', 'reconsented', ...options.consentStatuses])]
  return <>
    <div className="repository-page-heading"><div><p>Consent Management / {mode === 'history' ? 'Consent History' : 'Notice Details'}</p><h1>{title}</h1><span className="records-description">{mode === 'history' ? 'Search consent decisions and inspect their recorded lifecycle.' : 'View issued notices, responses, and associated consent records.'}</span></div><button type="button" className="secondary-button" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} className={loading ? 'ui-spin' : undefined} />Refresh</button></div>
    <form className="records-search-card records-search-card--updated" onSubmit={submit}>
      <div className="records-search-heading"><span><History size={22} aria-hidden="true" /></span><div><h2>Find {mode === 'history' ? 'consent history' : 'notices'}</h2><p>Search a user or notice, or combine filters to find the records you need.</p></div></div>
      <div className="records-search-line">
        <label><span>Search by</span><select value={draft.searchType} onChange={event => patch({ searchType: event.target.value })}><option value="data_principal_id">User ID / Email</option><option value="reference_id">Reference ID</option><option value="notice_id">Notice ID</option></select></label>
        <label className="records-search-input"><span>{draft.searchType === 'data_principal_id' ? 'User identifier' : draft.searchType === 'notice_id' ? 'Notice identifier' : 'Reference identifier'}</span><input value={draft.q} onChange={event => patch({ q: event.target.value })} maxLength={10000} placeholder={draft.searchType === 'data_principal_id' ? 'Enter the user ID or email saved with the notice' : draft.searchType === 'notice_id' ? 'Enter notice ID' : 'Enter reference ID'} /></label>
        <button type="submit" className="primary-button" disabled={loading}><Search size={16} aria-hidden="true" />{loading ? 'Searching…' : 'Search records'}</button>
      </div>
      <p className="records-search-hint">Use the exact identifier stored with the notice. For multiple values, separate them with commas. Leave blank to search all records.</p>
      <div className="records-date-fields">
        <label><span><CalendarDays size={15} aria-hidden="true" />Created from</span><input type="date" min="1900-01-01" max={draft.endDate || '9998-12-31'} value={draft.startDate} onChange={event => patch({ startDate: event.target.value })} /></label>
        <label><span>Created through</span><input type="date" min={draft.startDate || '1900-01-01'} max="9998-12-31" value={draft.endDate} onChange={event => patch({ endDate: event.target.value })} /></label>
        <p>Dates include the full selected day in India Standard Time (IST).</p>
      </div>
      <div className="records-filters"><span><Filter size={14} aria-hidden="true" />Refine results</span>
        <MultiFilter label="Notice template" values={draft.businessProcessCodes} options={options.businessProcesses.map(item => ({ value: item.code, label: item.name }))} onChange={value => patch({ businessProcessCodes: value })} />
        <MultiFilter label="Notice status" values={draft.noticeStatus} options={options.noticeStatuses.map(value => ({ value, label: statusText(value) }))} onChange={value => patch({ noticeStatus: value })} />
        <MultiFilter label="Consent status" values={draft.consentStatus} options={consentStatuses.map(value => ({ value, label: statusText(value) }))} onChange={value => patch({ consentStatus: value })} />
        <button type="button" className="records-text-button" onClick={reset}>Reset search</button>
      </div>
      {optionsError && <p className="repository-error" role="alert">Filter options could not be loaded: {optionsError} <button type="button" className="records-text-button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
    </form>
    {searched && <>
      {error && <p className="repository-error" role="alert">{error}</p>}
      {!error && page.summary && <div className="records-summary" aria-label="Matching record totals">{[['total', 'Matching notices'], ['pending', 'Pending notices'], ['accepted', 'Accepted notices'], ['rejected', 'Rejected notices']].map(([key, label]) => <article key={key}><span>{label}</span><strong>{page.summary?.[key] || 0}</strong></article>)}</div>}
      <div className="records-result-toolbar"><div className="records-view-tabs" aria-label="Notice views">{['all', 'pending', 'accepted', 'rejected', 'other'].map(view => <button type="button" key={view} aria-pressed={filters.view === view} onClick={() => { setDraft(current => ({ ...current, view })); setFilters(current => ({ ...current, view })); setOffset(0) }}>{view === 'all' ? 'All notices' : statusText(view)}</button>)}</div><label className="records-sort">Sort<select aria-label="Sort records" value={`${sort}:${direction}`} onChange={event => { const [field, order] = event.target.value.split(':'); setSort(field); setDirection(order); setOffset(0) }}><option value="updatedAt:desc">Recently updated</option><option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option><option value="linkExpiresAt:asc">Expiry date</option></select></label></div>
      <div className="repository-table-wrap records-table-wrap" aria-busy={loading}>{loading && <div className="repository-loading-line" aria-hidden="true" />}<table className="repository-table records-table"><thead><tr><th>#</th><th>Reference ID</th><th>Data principal</th>{mode === 'notices' && <th>Notice ID</th>}<th>Context</th><th>Notice status</th><th>Consent status</th>{mode === 'notices' && <><th>Minor</th><th>Created / Expires</th></>}<th>Updated</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={mode === 'history' ? 8 : 11}><Loading /></td></tr> : error ? <tr><td colSpan={11}><div className="repository-empty"><FileText size={24} /><strong>Records could not be loaded</strong><p>Use Refresh to try again.</p></div></td></tr> : page.items.length ? page.items.map((row, index) => <tr key={row.publicId}><td>{offset + index + 1}</td><td><CopyValue value={row.referenceId} label="reference ID" /></td><td><CopyValue value={row.dataPrincipalId} label="user ID" /></td>{mode === 'notices' && <td><CopyValue value={row.publicId} label="notice ID" /></td>}<td><span className="records-context"><small>{row.businessUnitName}</small><strong>{row.businessProcessName}</strong><small>v{row.businessProcessVersion}</small></span></td><td><Status value={row.status} /></td><td><Status value={row.effectiveConsentStatus} /></td>{mode === 'notices' && <><td>{row.forMinor ? 'Yes' : 'No'}</td><td><span className="records-dates">{dateText(row.createdAt)}<small>Expires: {dateText(row.linkExpiresAt)}</small></span></td></>}<td>{dateText(row.updatedAt)}</td><td><Link className="records-view-link" href={`${baseUrl(mode)}/${encodeURIComponent(row.publicId)}`} aria-label={`View notice ${row.publicId}`}><Eye size={15} />View</Link></td></tr>) : <tr><td colSpan={11}><div className="repository-empty"><Search size={24} /><strong>No records found</strong><p>Try different IDs, broaden the date range, or clear your filters.</p></div></td></tr>}
      </tbody></table></div>
      <Pagination page={page} offset={offset} limit={limit} loading={loading} onOffset={setOffset} onLimit={value => { setLimit(value); setOffset(0) }} />
    </>}
  </>
}

function Pagination({ page, offset, limit, loading, onOffset, onLimit }: { page: Page; offset: number; limit: number; loading: boolean; onOffset: (value: number) => void; onLimit: (value: number) => void }) {
  return <div className="repository-pagination"><label>Rows per page<select aria-label="Rows per page" value={limit} disabled={loading} onChange={event => onLimit(Number(event.target.value))}>{[10, 25, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label><span>{page.total ? offset + 1 : 0}&ndash;{Math.min(offset + page.items.length, page.total)} of {page.total}</span><button type="button" disabled={loading || offset === 0} onClick={() => onOffset(Math.max(0, offset - limit))}>Previous</button><button type="button" disabled={loading || offset + limit >= page.total} onClick={() => onOffset(offset + limit)}>Next</button></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="records-field"><dt>{label}</dt><dd>{children}</dd></div> }

function NoticeDetail({ publicId, mode }: { publicId: string; mode: Mode }) {
  const [notice, setNotice] = useState<Row | null>(null)
  const [page, setPage] = useState<Page>(emptyPage)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    Promise.all([consentRequest<Row>(`notices/${publicId}`, { signal: controller.signal }), consentRequest<Page>(`notices/${publicId}/consents?offset=${offset}&limit=${limit}`, { signal: controller.signal })]).then(([value, records]) => { setNotice(value); setPage(records) }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [publicId, offset, limit, revision])
  return <>
    <Link href={baseUrl(mode)} className="records-back"><ArrowLeft size={16} />Back to {mode === 'history' ? 'Consent History' : 'Notice Details'}</Link>
    <div className="repository-page-heading"><div><p>Consent Management / Notice record</p><h1>{mode === 'history' ? 'Consent History' : 'Notice Details'}</h1><CopyValue value={publicId} label="notice ID" /></div><button type="button" className="secondary-button" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} />Refresh</button></div>
    {error ? <p className="repository-error" role="alert">{error}</p> : loading && !notice ? <Loading message="Loading notice details" /> : notice && <>
      <div className="records-detail-grid"><section className="records-panel"><h2><FileText size={19} />Notice information</h2><dl className="records-fields"><Field label="User ID"><CopyValue value={notice.dataPrincipalId} label="user ID" /></Field><Field label="Reference ID"><CopyValue value={notice.referenceId} label="reference ID" /></Field><Field label="Notice status"><Status value={notice.status} /></Field><Field label="Consent status"><Status value={notice.effectiveConsentStatus} /></Field><Field label="Created">{dateText(notice.createdAt)}</Field><Field label="Updated">{dateText(notice.updatedAt)}</Field><Field label="Link expires">{dateText(notice.linkExpiresAt)}</Field><Field label="Completed">{dateText(notice.markCompletedTimestamp)}</Field><Field label="For a minor">{notice.forMinor ? 'Yes' : 'No'}</Field><Field label="Language">{notice.defaultLanguage}</Field><Field label="Creation method">{notice.creationMethod}</Field><Field label="Consent duration">{notice.consentDuration == null ? 'Not specified' : `${notice.consentDuration} hours`}</Field>{notice.statusReason && <Field label="Status reason">{notice.statusReason}</Field>}<Field label="Created by">{notice.createdByUserId}</Field></dl></section>
        <section className="records-panel"><h2><ShieldCheck size={19} />Notice template</h2><dl className="records-fields"><Field label="Organization">{notice.businessUnitName}</Field><Field label="Process">{notice.businessProcessName}</Field><Field label="Version">v{notice.businessProcessVersion}</Field><Field label="Template layout">{notice.businessProcess?.template}</Field></dl><h3>Grant description</h3><p className="records-prose">{notice.businessProcess?.grantDescription}</p>{notice.businessProcess?.revokeDescription && <><h3>Revoke description</h3><p className="records-prose">{notice.businessProcess.revokeDescription}</p></>}{notice.businessProcess?.reconsentDescription && <><h3>Reconsent description</h3><p className="records-prose">{notice.businessProcess.reconsentDescription}</p></>}
          {Object.keys(notice.businessProcess?.legalDocuments || {}).length > 0 && <><h3>Legal documents</h3><dl className="records-fields">{Object.entries(notice.businessProcess.legalDocuments).map(([key, value]) => <Field key={key} label={key}><CopyValue value={value} label="document URL" /></Field>)}</dl></>}
        </section></div>
      {notice.forMinor && <GuardianEvidence metadata={notice.metadata || []} />}
      <section className="records-panel records-consents"><h2><History size={19} />Consent Artifacts <span>{page.total}</span></h2>{!notice.consentAssociationAvailable && <p className="repository-notice">This notice has no reference ID. Consent associations cannot be determined reliably.</p>}
        <div className="repository-table-wrap" aria-busy={loading}><table className="repository-table"><thead><tr><th>Purpose</th><th>Processing activity</th><th>Status</th><th>Data attributes</th><th>Expires</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><Loading /></td></tr> : page.items.length ? page.items.map(row => <tr key={row.publicId}><td>{row.consentPurposeName}</td><td>{row.processingPurposeName}</td><td><Status value={row.status} /></td><td>{(row.userAttributeNames || []).join(', ') || '\u2014'}</td><td>{dateText(row.expiresAt)}</td><td><button type="button" className="records-view-link" onClick={() => setSelected(row.publicId)}><Eye size={15} />View artifact</button></td></tr>) : <tr><td colSpan={6}><div className="repository-empty"><History size={24} /><strong>No consent artifacts found</strong><p>No consents match this notice's user, reference, and process version.</p></div></td></tr>}</tbody></table></div>
        <Pagination page={page} offset={offset} limit={limit} loading={loading} onOffset={setOffset} onLimit={value => { setLimit(value); setOffset(0) }} />
      </section>
      <div className="records-detail-grid"><section className="records-panel"><h2>Notice metadata</h2>{notice.metadata?.length ? <dl className="records-fields">{notice.metadata.map((item: Row, index: number) => <Field key={`${item.key}-${index}`} label={item.key}><CopyValue value={item.value} label={item.key} /></Field>)}</dl> : <p className="records-description">No metadata was recorded.</p>}</section><section className="records-panel"><h2>Submitted data and configuration</h2><JsonDetails label="Submitted data" value={notice.dataPrincipalSubmittedData} /><JsonDetails label="Notice configuration" value={notice.noticeConfig} /></section></div>
    </>}
    {selected && <RepositoryDialog title="Consent Artifact" onClose={() => setSelected(null)}><ConsentEvents publicId={selected} /></RepositoryDialog>}
  </>
}

function JsonDetails({ label, value }: { label: string; value: any }) {
  return <details className="records-json"><summary>{label}</summary><pre>{value == null ? 'Not recorded' : JSON.stringify(value, null, 2)}</pre></details>
}

function GuardianEvidence({ metadata }: { metadata: Row[] }) {
  let evidence: Row | null = null
  try {
    const raw = metadata.find(item => item.key === 'guardian_consent_evidence')?.value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) evidence = parsed
  } catch { /* Older notices may not contain structured guardian evidence. */ }
  return <section className="records-panel"><h2><ShieldCheck size={19} />Parent / lawful guardian consent</h2>
    <p className="repository-notice">Child notice. {evidence ? 'Demo evidence only: identity, age, contact ownership and guardianship have not been independently verified.' : 'No guardian validation evidence has been recorded.'}</p>
    {evidence && <dl className="records-fields"><Field label="Guardian name">{evidence.name}</Field><Field label="Relationship">{statusText(evidence.relationship)}</Field><Field label="Guardian email">{evidence.email}</Field><Field label="Verification method">{statusText(evidence.verificationMethod || 'not recorded')}</Field><Field label="Verified identifier (masked)">{evidence.maskedIdentifier || 'Not recorded'}</Field><Field label="Demo OTP">{evidence.demoOtpVerified ? 'Passed (demo only)' : 'Not recorded'}</Field><Field label="Verification mode">Demo only — not identity verified</Field><Field label="Validation reference">{evidence.reference}</Field><Field label="Recorded at">{dateText(evidence.recordedAt)}</Field></dl>}
  </section>
}

function ConsentEvents({ publicId }: { publicId: string }) {
  const [consent, setConsent] = useState<Row | null>(null)
  const [page, setPage] = useState<Page>(emptyPage)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    Promise.all([consentRequest<Row>(`consents/${publicId}`, { signal: controller.signal }), consentRequest<Page>(`consents/${publicId}/events?offset=${offset}&limit=${limit}`, { signal: controller.signal })]).then(([record, events]) => { setConsent(record); setPage(events) }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [publicId, offset, limit, revision])
  return <div className="repository-form"><CopyValue value={publicId} label="consent ID" />{error ? <div role="alert" className="repository-error">{error}<button className="records-text-button" onClick={() => setRevision(value => value + 1)}>Retry</button></div> : consent && <dl className="records-fields records-consent-summary"><Field label="Purpose">{consent.consentPurposeName}</Field><Field label="Activity">{consent.processingPurposeName}</Field><Field label="Status"><Status value={consent.status} /></Field><Field label="User ID"><CopyValue value={consent.dataPrincipalId} label="user ID" /></Field><Field label="Reference ID"><CopyValue value={consent.referenceId} label="reference ID" /></Field><Field label="Request ID"><CopyValue value={consent.requestId} label="request ID" /></Field><Field label="Granted">{dateText(consent.insertedAt)}</Field><Field label="Expires">{dateText(consent.expiresAt)}</Field><Field label="Data attributes">{(consent.userAttributeNames || []).join(', ')}</Field><Field label="Consent duration">{consent.consentDuration == null ? 'Until purpose is met' : `${consent.consentDuration} hours`}</Field></dl>}
    {loading ? <Loading message="Loading lifecycle events" /> : !error && <><h3 className="records-events-heading">Lifecycle events ({page.total})</h3>{page.items.length ? <ol className="records-timeline">{page.items.map(event => <li key={event.publicId}><span className="records-timeline-dot" /><div><div className="records-event-heading"><Status value={event.action} /><time>{dateText(event.timestamp)}</time></div><p>Actor: {event.actor}</p><JsonDetails label="Event details" value={event.details} /></div></li>)}</ol> : <p className="repository-notice">No lifecycle events have been recorded for this consent.</p>}<Pagination page={page} offset={offset} limit={limit} loading={loading} onOffset={setOffset} onLimit={value => { setLimit(value); setOffset(0) }} /></>}
  </div>
}
