'use client'

import { useEffect, useRef, useState } from 'react'
import { consentRequest, type ElementRecord } from './api'

export default function ConsentAuditHistory({ record, revision, onClose }: { record: ElementRecord; revision: number; onClose: () => void }) {
  const [data, setData] = useState<{ items: ElementRecord[]; total: number }>({ items: [], total: 0 })
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [record.publicId])
  useEffect(() => {
    let current = true
    setLoading(true); setError('')
    consentRequest<{ items: ElementRecord[]; total: number }>(`consents/${record.publicId}/events?offset=${offset}&limit=10`)
      .then(result => { if (current) setData(result) })
      .catch(failure => { if (current) { setData({ items: [], total: 0 }); setError(failure instanceof Error ? failure.message : 'Unable to load audit history.') } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [record.publicId, offset, revision])
  const reason = (value: unknown) => {
    try {
      const details = typeof value === 'string' ? JSON.parse(value) : value
      return details && typeof details === 'object' && 'reason' in details ? String(details.reason) : '—'
    } catch { return '—' }
  }
  const timestamp = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date) + ' IST'
  }
  return <section className="consent-audit-history" aria-labelledby="consent-audit-history-title">
    <div className="repository-toolbar"><div><h2 id="consent-audit-history-title" tabIndex={-1} ref={heading}>Consent audit history</h2><p>{record.dataPrincipalId} · {record.activityName}</p></div><button type="button" className="secondary-button" onClick={onClose}>Close history</button></div>
    <p className="repository-muted">Reconsent, revocation, admin identity and reasons are read directly from the consent lifecycle history, including older records.</p>
    {error && <div className="repository-error" role="alert">{error}</div>}
    <div className="repository-table-wrap" aria-busy={loading}><table className="repository-table"><thead><tr><th>Action</th><th>Performed by</th><th>Reason</th><th>Date / Time</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} role="status">Loading audit history…</td></tr> : data.items.length ? data.items.map(event => <tr key={event.publicId}><td><strong>{event.action === 'RENEWED' ? 'Reconsent / Renewal' : event.action === 'REVOKED' ? 'Revocation' : event.action}</strong></td><td>{event.actor}</td><td className="consent-audit-reason">{reason(event.details)}</td><td>{timestamp(event.timestamp)}</td></tr>) : <tr><td colSpan={4}>No audit events recorded for this consent yet.</td></tr>}</tbody></table></div>
    <div className="repository-pagination"><span>{data.total ? `${offset + 1}–${Math.min(offset + 10, data.total)}` : 0} of {data.total}</span><button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 10))}>Previous</button><button type="button" disabled={offset + 10 >= data.total || loading} onClick={() => setOffset(value => value + 10)}>Next</button></div>
  </section>
}
