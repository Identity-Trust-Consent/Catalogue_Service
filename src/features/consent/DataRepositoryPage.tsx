'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Eye, Pencil, Plus, Trash2, RefreshCw, Search, Database, LoaderCircle, ArrowDown, ArrowUp, ArrowLeft, ChevronsUpDown } from 'lucide-react'
import { CatalogueProvider } from '../catalogue/context/CatalogueContext'
import OrgSidebar from '../catalogue/components/OrgSidebar'
import OrgTopbar from '../catalogue/components/OrgTopbar'
import RepositoryForm, { RepositoryDialog } from './RepositoryForms'
import SetupProgress from './SetupProgress'
import { apiPath, consentAccess, consentRequest, currentConsentToken, repositoryPages, repositoryUrl, type ElementRecord } from './api'

export default function DataRepositoryPage({ resource }: { resource: string }) {
  return <CatalogueProvider initialView="org-consent-repository"><RepositoryScreen key={resource} resource={resource} /></CatalogueProvider>
}

function RepositoryScreen({ resource }: { resource: string }) {
  const config = repositoryPages.find(page => page.key === resource) || { title: 'Data Processors', singular: 'Data Processor' }
  const [access, setAccess] = useState({ read: false, write: false, ready: false })
  const [rows, setRows] = useState<ElementRecord[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(10)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<{ initial: ElementRecord | null; readOnly: boolean } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ElementRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [sort, setSort] = useState({ field: 'updatedAt', direction: 'desc' })
  const isTemplate = resource === 'notice-templates'
  const heading = useRef<HTMLHeadingElement>(null)
  const editorTitle = editor ? `${editor.readOnly ? 'View' : editor.initial ? 'Edit' : 'New'} ${config.singular}` : config.title
  useEffect(() => {
    if (editor) {
      heading.current?.focus()
      heading.current?.scrollIntoView({ block: 'start' })
    }
  }, [editor])
  const columnCount = resource === 'data-processors' || resource === 'consent-purposes' || isTemplate ? 5 : 4
  const sortIcon = (field: string) => sort.field !== field ? <ChevronsUpDown size={14} aria-hidden="true" /> : sort.direction === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />
  useEffect(() => {
    const refresh = () => setAccess({ ...consentAccess(currentConsentToken()), ready: true })
    refresh(); window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  useEffect(() => {
    if (!access.read) return
    let current = true
    const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ offset: String(offset), limit: String(limit), q: query, sort: sort.field, direction: sort.direction })
        const result = await consentRequest<{ items: ElementRecord[]; total: number }>(`${apiPath(resource)}?${params}`)
        if (current) { setRows(result.items); setTotal(result.total) }
      } catch (failure) { if (current) { setRows([]); setError(failure instanceof Error ? failure.message : 'Unable to load repository records.') } }
      finally { if (current) setLoading(false) }
    }, 200)
    return () => { current = false; clearTimeout(timer) }
  }, [resource, query, offset, limit, revision, access.read, sort.field, sort.direction])

  const edit = async (row: ElementRecord, readOnly: boolean) => {
    setBusy(true); setError(''); setFormError('')
    try {
      let initial = await consentRequest<ElementRecord>(`${apiPath(resource)}/${encodeURIComponent(resource === 'data-processors' ? row.ouId : row.id)}`)
      if (isTemplate) initial = { ...initial, consentPurposes: initial.consentPurposes.map((purpose: ElementRecord) => ({ ...purpose,
        durationType: purpose.consentDuration == null ? 'until_purpose_met' : 'custom_duration', durationUnit: purpose.consentDuration == null ? undefined : 'hours',
        processingRules: purpose.processingRules.map((rule: ElementRecord) => ({ ...rule, isMandatory: rule.mandatory, isReconsentable: rule.reconsentableByPrincipal, isRevocable: rule.revocableByPrincipal })) })) }
      setEditor({ initial, readOnly })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to open record.') }
    finally { setBusy(false) }
  }
  const save = async (body: ElementRecord) => {
    setBusy(true); setFormError('')
    try {
      const initial = editor?.initial
      const id = resource === 'data-processors' ? initial?.ouId : initial?.id
      const result = await consentRequest<ElementRecord>(`${apiPath(resource)}${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) })
      setEditor(null); setNotice(result.isNewVersion ? `New purpose version v${result.version} saved. ${result.propagatedTemplates?.length || 0} notice template(s) received a new version.` : `${config.singular} saved successfully.`)
      setRevision(value => value + 1)
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Unable to save record.') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!pendingDelete) return
    setBusy(true); setFormError('')
    try {
      await consentRequest(`${apiPath(resource)}/${encodeURIComponent(resource === 'data-processors' ? pendingDelete.ouId : pendingDelete.id)}`, { method: 'DELETE' })
      setPendingDelete(null); setNotice(`${config.singular} deleted.`); setOffset(0); setRevision(value => value + 1)
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Unable to delete record.') }
    finally { setBusy(false) }
  }
  const sortBy = (field: string) => { setOffset(0); setSort(current => ({ field, direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc' })) }
  return <div className="org-dashboard-shell org-console-shell repository-shell">
    <OrgSidebar activeItem="Consent Management" />
    <main className="org-main org-console-main"><OrgTopbar heading="Data Element Repository" />
      <section className="repository-content">
        <div className="repository-page-heading"><div><p>Consent Management / Data Element Repository{editor && ` / ${config.title}`}</p><h1 ref={heading} tabIndex={-1}>{editorTitle}</h1></div>{editor ? <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditor(null)}><ArrowLeft size={16} aria-hidden="true" />Back to {config.title}</button> : <button type="button" className="secondary-button" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'ui-spin' : undefined} aria-hidden="true" />Refresh</button>}</div>
        {!editor && <SetupProgress title="Consent setup" steps={repositoryPages.map(page => ({ label: page.title, href: repositoryUrl(page.key) }))} currentIndex={repositoryPages.findIndex(page => page.key === resource)} />}
        {!access.ready ? <p role="status">Checking access…</p> : !access.read ? <div className="repository-error" role="alert">Sign in with an Identity OS administrator or consent repository role to access this page. <Link href="/organization">Sign in</Link></div> : editor ? <div className="repository-editor" aria-busy={busy}><RepositoryForm resource={resource} initial={editor.initial} readOnly={editor.readOnly} busy={busy} error={formError} onSave={save} onClose={() => setEditor(null)} /></div> : <>
          {notice && <div className="repository-success" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
          {error && <p role="alert" className="repository-error">{error}</p>}
          <div className="repository-toolbar"><p>{config.title} <strong>({total})</strong></p><div><label className="repository-search"><span className="repository-sr-only">Search by name</span><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search by name" value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} /></label>
            {access.write && <button type="button" className="primary-button" onClick={() => { setFormError(''); setEditor({ initial: null, readOnly: false }) }}><Plus size={18} />New {config.singular}</button>}</div></div>
          {!access.write && <p className="repository-muted">You have read-only access.</p>}
          <div className="repository-table-wrap" aria-busy={loading}>
            {loading && <div className="repository-loading-line" aria-hidden="true" />}
            <table className="repository-table"><thead><tr><th aria-sort={sort.field === 'name' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button onClick={() => sortBy('name')}>Name {sortIcon('name')}</button></th>
              {resource === 'data-processors' && <th>OU ID</th>}
              {resource === 'user-attributes' ? <th>PII</th> : resource === 'business-units' || resource === 'data-processors' ? <th>Active</th> : resource === 'consent-purposes' || isTemplate ? <><th>Version</th><th>Status</th></> : <th>Description</th>}
              <th aria-sort={sort.field === 'updatedAt' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button onClick={() => sortBy('updatedAt')}>Last updated {sortIcon('updatedAt')}</button></th><th>Actions</th></tr></thead>
              <tbody>{loading ? <tr><td colSpan={columnCount}><div className="repository-loading" role="status"><span><LoaderCircle size={17} className="ui-spin" aria-hidden="true" />Loading records</span></div></td></tr> : rows.length ? rows.map(row => <tr key={row.id || row.ouId}>
                <td><button className="repository-record-link" onClick={() => edit(row, true)} disabled={busy}>{row.name || row.brandName}</button></td>
                {resource === 'data-processors' && <td>{row.ouId}</td>}
                {resource === 'user-attributes' ? <td><span className={`repository-badge ${row.pii ? 'is-active' : ''}`}>{row.pii ? 'Yes' : 'No'}</span></td> : resource === 'business-units' || resource === 'data-processors' ? <td><span className={`repository-badge ${row.active ? 'is-active' : ''}`}>{row.active ? 'Active' : 'Inactive'}</span></td> : resource === 'consent-purposes' || isTemplate ? <><td>v{row.version}</td><td><span className={`repository-badge ${row.status === 'published' ? 'is-active' : ''}`}>{row.status}</span></td></> : <td>{row.description}</td>}
                <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td><td><div className="repository-row-actions"><button type="button" title="View" aria-label={`View ${row.name || row.brandName}`} onClick={() => edit(row, true)} disabled={busy}><Eye size={18} /></button>{access.write && !isTemplate && <><button type="button" title="Edit" aria-label={`Edit ${row.name || row.brandName}`} onClick={() => edit(row, false)} disabled={busy}><Pencil size={18} /></button>{resource !== 'consent-purposes' && <button type="button" title="Delete" className="repository-danger" aria-label={`Delete ${row.name || row.brandName}`} onClick={() => { setFormError(''); setPendingDelete(row) }} disabled={busy}><Trash2 size={18} /></button>}</>}</div></td>
              </tr>) : <tr><td colSpan={columnCount}><div className="repository-empty">{query ? <Search size={24} aria-hidden="true" /> : <Database size={24} aria-hidden="true" />}<strong>{query ? 'No matching records' : `No ${config.title.toLowerCase()} yet`}</strong><p>{query ? 'Try a different name or clear your search to see all records.' : `Your ${config.title.toLowerCase()} will appear here. ${access.write ? `Use New ${config.singular} to add your first record.` : 'Records will appear when an administrator adds them.'}`}</p></div></td></tr>}</tbody>
            </table>
          </div>
          <div className="repository-pagination"><label>Rows per page<select value={limit} onChange={event => { setLimit(Number(event.target.value)); setOffset(0) }}>{[10, 25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><span>{total ? `${offset + 1}–${Math.min(offset + limit, total)}` : '0'} of {total}</span><button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button><button type="button" disabled={offset + limit >= total || loading} onClick={() => setOffset(offset + limit)}>Next</button></div>
        </>}
      </section>
    </main>
    {pendingDelete && <RepositoryDialog title={`Delete ${config.singular}`} busy={busy} onClose={() => setPendingDelete(null)}><div className="repository-form"><p>Delete <strong>{pendingDelete.name || pendingDelete.brandName}</strong>? Records referenced by purposes or notice templates cannot be deleted.</p>{formError && <p role="alert" className="repository-error">{formError}</p>}<footer className="repository-form-actions"><button type="button" disabled={busy} onClick={() => setPendingDelete(null)}>Cancel</button><button type="button" disabled={busy} className="repository-delete-button" onClick={remove}>{busy ? 'Deleting…' : 'Delete'}</button></footer></div></RepositoryDialog>}
  </div>
}
