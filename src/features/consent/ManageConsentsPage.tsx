'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, LoaderCircle, LockKeyhole, RefreshCw, RotateCcw, Ban } from 'lucide-react'
import { CatalogueProvider } from '../catalogue/context/CatalogueContext'
import OrgSidebar from '../catalogue/components/OrgSidebar'
import OrgTopbar from '../catalogue/components/OrgTopbar'
import { consentAccess, consentRequest, currentConsentToken, type ElementRecord } from './api'
import ConsentAuditHistory from './ConsentAuditHistory'

export default function ManageConsentsPage() {
  return <CatalogueProvider initialView="org-consent-repository"><Screen /></CatalogueProvider>
}

function Screen() {
  const [access, setAccess] = useState({ read: false, write: false, ready: false })
  const [data, setData] = useState<{ items: ElementRecord[]; total: number }>({ items: [], total: 0 })
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState<{ record: ElementRecord; type: 'update' | 'revoke' } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [historyRecord, setHistoryRecord] = useState<ElementRecord | null>(null)
  useEffect(() => {
    const refresh = () => setAccess({ ...consentAccess(currentConsentToken()), ready: true })
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  useEffect(() => {
    if (!access.read) return
    let current = true
    const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const result = await consentRequest<{ items: ElementRecord[]; total: number }>(`admin-consents?${new URLSearchParams({ q: query, offset: String(offset), limit: '10' })}`)
        if (current) setData(result)
      } catch (failure) { if (current) { setError(failure instanceof Error ? failure.message : 'Unable to load consent records.'); setData({ items: [], total: 0 }) } }
      finally { if (current) setLoading(false) }
    }, 200)
    return () => { current = false; clearTimeout(timer) }
  }, [access.read, query, offset, revision])
  const open = (record: ElementRecord, type: 'update' | 'revoke') => { setReason(''); setError(''); setNotice(''); setAction({ record, type }) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!action || busy || !access.write) return
    setBusy(true); setError('')
    try {
      await consentRequest(`admin-consents/${action.record.publicId}/${action.type}`, { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: action.record.updatedAt, reason: reason.trim() }) })
      setNotice(action.type === 'revoke' ? 'Consent revoked. The action has been recorded in consent history.' : 'Consent renewed using the original template duration. The action has been recorded in consent history.')
      setHistoryRecord(action.record); setAction(null); setRevision(value => value + 1)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to change consent.') }
    finally { setBusy(false) }
  }
  const status = (record: ElementRecord) => record.status === 'accepted' && (record.isExpired || record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) ? 'expired' : record.status
  return <div className="org-dashboard-shell org-console-shell repository-shell"><OrgSidebar activeItem="Consent Management" /><main className="org-main org-console-main"><OrgTopbar heading="Update / Revoke Consent" /><section className="repository-content">
    <div className="repository-page-heading"><div><p>Consent Management / Consent actions</p><h1>{action ? action.type === 'revoke' ? 'Revoke consent' : 'Renew / Re-enable consent' : 'Update / Revoke Consent'}</h1></div><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => { setAction(null); setRevision(value => value + 1) }}><RefreshCw size={16} aria-hidden="true" />Refresh</button></div>
    {!access.ready ? <p role="status">Checking access…</p> : !access.read ? <div className="repository-error" role="alert">Sign in with an administrator or consent read role to view consent records. <Link href="/organization">Sign in</Link></div> : <>
      <div className="repository-notice">Only records with reconsent or revocation enabled in their original notice template are shown. Mandatory activities are locked. Renewal restores consent using the original template duration and keeps its purpose and data attributes unchanged.</div>
      {!access.write && <p className="repository-muted">You have read-only access.</p>}
      {notice && <div className="repository-success" role="status">{notice}</div>}{error && <div className="repository-error" role="alert">{error}</div>}
      {!action && historyRecord && <ConsentAuditHistory key={historyRecord.publicId} record={historyRecord} revision={revision} onClose={() => setHistoryRecord(null)} />}
      {action ? <div className="repository-editor"><form className="repository-form" onSubmit={submit}>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setAction(null)}><ArrowLeft size={16} aria-hidden="true" />Back to records</button>
        <dl className="repository-summary"><dt>User</dt><dd>{action.record.dataPrincipalId}</dd><dt>Notice template</dt><dd>{action.record.templateName} · v{action.record.templateVersion}</dd><dt>Purpose / activity</dt><dd>{action.record.purposeName} / {action.record.activityName}</dd><dt>Current status</dt><dd>{status(action.record)}</dd><dt>Data attributes</dt><dd>{action.record.userAttributeNames.join(', ') || 'None'}</dd>{action.type === 'update' && <><dt>Renewed validity</dt><dd>{action.record.renewalDuration == null ? 'Until the purpose is met' : `${action.record.renewalDuration} hours from renewal`}</dd></>}</dl>
        <p>{action.type === 'revoke' ? 'This stops this consent from being active. The original consent and its history will be retained.' : 'This will re-enable revoked or expired consent, or restart the validity period of active consent. No new purpose or data attributes will be added.'}</p>
        <label>Reason for this action<textarea required maxLength={1000} rows={3} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Explain why this admin action is being performed" /></label>
        <footer className="repository-form-actions"><button type="button" disabled={busy} onClick={() => setAction(null)}>Cancel</button><button type="submit" disabled={busy || !reason.trim()} className={action.type === 'revoke' ? 'repository-delete-button' : 'primary-button'}>{busy ? 'Saving…' : action.type === 'revoke' ? 'Confirm revocation' : 'Confirm renewal'}</button></footer>
      </form></div> : <>
        <div className="repository-toolbar"><p>Eligible records <strong>({data.total})</strong></p><label className="repository-search"><span className="repository-sr-only">Search consent records</span><input type="search" placeholder="Search user, purpose or notice" value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} /></label></div>
        <div className="repository-table-wrap" aria-busy={loading}><table className="repository-table"><thead><tr><th>User</th><th>Notice / Purpose</th><th>Status</th><th>Allowed actions</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}><div className="repository-loading" role="status"><LoaderCircle size={18} className="ui-spin" />Loading records…</div></td></tr> : !data.items.length ? <tr><td colSpan={5}><div className="repository-empty"><strong>No eligible consent records</strong><p>Records appear after consent is given for a template activity that allows reconsent or revocation.</p></div></td></tr> : data.items.map(record => <tr key={record.publicId}>
          <td>{record.dataPrincipalId}<div className="repository-muted">{record.referenceId}</div></td><td><strong>{record.templateName} · v{record.templateVersion}</strong><div>{record.purposeName}</div><div className="repository-muted">{record.activityName}</div><button type="button" className="consent-audit-link" onClick={() => setHistoryRecord(record)}>View audit history</button></td>
          <td><span className={`repository-badge ${status(record) === 'accepted' ? 'is-active' : ''}`}>{status(record)}</span></td>
          <td>{record.mandatory ? <span className="repository-inline"><LockKeyhole size={15} aria-hidden="true" />Mandatory · locked</span> : <>{record.reconsentable && <div>Renew / Re-enable</div>}{record.revocable && <div>Revoke</div>}</>}</td>
          <td><div className="repository-inline"><button type="button" className="secondary-button" disabled={!access.write || !record.canUpdate} onClick={() => open(record, 'update')} title={record.mandatory ? 'Mandatory consent cannot be changed' : !record.reconsentable ? 'Reconsent is disabled in the notice template' : 'Renew using the original template duration'}><RotateCcw size={15} aria-hidden="true" />Renew</button><button type="button" className="secondary-button repository-danger" disabled={!access.write || !record.canRevoke} onClick={() => open(record, 'revoke')} title={record.mandatory ? 'Mandatory consent cannot be revoked' : !record.revocable ? 'Revocation is disabled in the notice template' : 'Revoke active consent'}><Ban size={15} aria-hidden="true" />Revoke</button></div></td>
        </tr>)}</tbody></table></div>
        <div className="repository-pagination"><span>{data.total ? `${offset + 1}–${Math.min(offset + 10, data.total)}` : '0'} of {data.total}</span><button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 10))}>Previous</button><button type="button" disabled={offset + 10 >= data.total || loading} onClick={() => setOffset(value => value + 10)}>Next</button></div>
      </>}
    </>}
  </section></main></div>
}
