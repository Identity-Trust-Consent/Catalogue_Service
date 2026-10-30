'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye, LoaderCircle, Monitor, RefreshCw, Smartphone } from 'lucide-react'
import { CatalogueProvider } from '../catalogue/context/CatalogueContext'
import OrgSidebar from '../catalogue/components/OrgSidebar'
import OrgTopbar from '../catalogue/components/OrgTopbar'
import RegistrationNotice, { type RegistrationNoticeData } from '../catalogue/pages/RegistrationNotice'
import { allElements, consentAccess, consentRequest, currentConsentToken, type ElementRecord } from './api'

type Props = { privacy: RegistrationNoticeData['privacy']; configuredCode: string }

export default function NoticePreviewPage(props: Props) {
  return <CatalogueProvider initialView="org-consent-repository"><PreviewScreen {...props} /></CatalogueProvider>
}

function PreviewScreen({ privacy, configuredCode }: Props) {
  const [access, setAccess] = useState({ read: false, ready: false })
  const [templates, setTemplates] = useState<ElementRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState<RegistrationNoticeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [mobile, setMobile] = useState(false)
  const [minorPreview, setMinorPreview] = useState(false)
  useEffect(() => {
    const refresh = () => setAccess({ read: consentAccess(currentConsentToken()).read, ready: true })
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  useEffect(() => {
    if (!access.read) return
    let current = true
    setLoading(true); setError(''); setNotice(null)
    allElements('notice-templates').then(items => {
      if (!current) return
      const published = items.filter(item => item.status === 'published')
      setTemplates(published)
      setSelectedId(previous => published.some(item => String(item.id) === previous) ? previous : String(published.filter(item => item.code === configuredCode).sort((a, b) => b.version - a.version)[0]?.id || published[0]?.id || ''))
    }).catch(failure => { if (current) { setTemplates([]); setSelectedId(''); setError(failure instanceof Error ? failure.message : 'Unable to load notice templates.') } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [access.read, configuredCode, revision])
  useEffect(() => {
    if (!access.read || !selectedId || loading) { setNotice(null); setLoadingPreview(false); return }
    let current = true
    setLoadingPreview(true); setNotice(null); setError('')
    const load = async () => {
      const template = await consentRequest<ElementRecord>(`notice-templates/${selectedId}`)
      if (template.status !== 'published') throw new Error('This template is no longer published. Refresh to choose another template.')
      const [unit, purposes] = await Promise.all([
        consentRequest<ElementRecord>(`repository/business-units/${template.businessUnitId}`),
        Promise.all(template.consentPurposes.map(async (mapping: ElementRecord) => ({ mapping, purpose: await consentRequest<ElementRecord>(`repository/consent-purposes/${mapping.consentPurposeId}`) }))),
      ])
      const activities = purposes.flatMap(({ mapping, purpose }: { mapping: ElementRecord; purpose: ElementRecord }) => mapping.processingRules.map((rule: ElementRecord) => {
        const activity = purpose.processingPurposes.find((item: ElementRecord) => item.id === rule.processingPurposeId)
        if (!activity) throw new Error('A template activity could not be loaded. Refresh and try again.')
        return { id: rule.id, name: activity.name, description: activity.description || '', purposeName: purpose.name, mandatory: !!rule.mandatory, userAttributeNames: activity.userAttributeNames || [], consentDuration: mapping.consentDuration == null ? null : Number(mapping.consentDuration) }
      }))
      if (current) setNotice({ id: '', token: '', status: 'preview', consentStatus: null, dataPrincipalId: '', privacy,
        template: { name: template.name, code: template.code, version: template.version, grantDescription: template.grantDescription, organizationName: unit.name, legalDocuments: template.legalDocuments || {} }, activities })
    }
    load().catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Unable to load the notice preview.') })
      .finally(() => { if (current) setLoadingPreview(false) })
    return () => { current = false }
  }, [access.read, selectedId, loading, revision, privacy])

  return <div className="org-dashboard-shell org-console-shell repository-shell"><OrgSidebar activeItem="Consent Management" />
    <main className="org-main org-console-main"><OrgTopbar heading="Notice Preview" /><section className="repository-content">
      <div className="repository-page-heading"><div><p>Consent Management / Notice Preview</p><h1>Notice Preview</h1><p className="notice-preview-intro">Review the notice exactly as it appears during registration.</p></div><button type="button" className="secondary-button" disabled={loading || loadingPreview} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh</button></div>
      {!access.ready ? <p role="status">Checking access…</p> : !access.read ? <div className="repository-error" role="alert">Sign in with an administrator or consent read role to preview notices. <Link href="/organization">Sign in</Link></div> : <>
        <div className="notice-preview-toolbar"><label htmlFor="notice-preview-template">Published notice template<select id="notice-preview-template" value={selectedId} disabled={loading} onChange={event => setSelectedId(event.target.value)}><option value="">Select a template</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label><div className="notice-preview-devices" role="group" aria-label="Preview size"><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={17} aria-hidden="true" />Desktop</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={17} aria-hidden="true" />Mobile</button></div></div>
        <label className="repository-check"><input type="checkbox" checked={minorPreview} onChange={event => setMinorPreview(event.target.checked)} />Preview parent / lawful guardian section for a child</label>
        {error && <div className="repository-error" role="alert">{error}</div>}
        {loading || loadingPreview ? <div className="repository-loading" role="status"><LoaderCircle size={20} className="ui-spin" aria-hidden="true" />Loading preview…</div> : notice ? <div className={`notice-preview-stage${mobile ? ' is-mobile' : ''}`}><RegistrationNotice key={`${selectedId}-${revision}-${minorPreview}`} notice={{ ...notice, forMinor: minorPreview, guardianVerificationMode: 'DEMO_ONLY', dataPrincipalId: minorPreview ? 'child@example.test' : '' }} preview onClose={() => setSelectedId('')} /></div> : !error && <div className="notice-preview-empty"><Eye size={30} aria-hidden="true" /><h2>{templates.length ? 'Choose a template to preview' : 'No published notice templates'}</h2><p>{templates.length ? 'Select a published template above to see the notice.' : 'Publish a notice template to preview its content and consent choices.'}</p><Link href="/organization/consent/notice-templates">View notice templates</Link></div>}
      </>}
    </section></main>
  </div>
}
