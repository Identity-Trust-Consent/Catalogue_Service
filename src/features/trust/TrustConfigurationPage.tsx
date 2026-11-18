'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronDown, Clock3, FileCheck2, History, Info, LockKeyhole, Plus, RefreshCw, Save, Search, ShieldCheck, SlidersHorizontal, Upload } from 'lucide-react'
import { useCatalogue } from '../catalogue/context/CatalogueContext'
import OrgSidebar from '../catalogue/components/OrgSidebar'
import OrgTopbar from '../catalogue/components/OrgTopbar'
import TrustBreakdown from './TrustBreakdown'
import { trustRequest, type TrustScore } from './api'

type Parameter = { code: string; name: string; description: string; dataSource: string; scoringRule: string; mandatory: boolean; freshnessSeconds: number; defaultWeight: number }
type Master = { code: string; name: string; description: string; defaultWeight: number; parameters: Parameter[] }
type ParameterConfig = { code: string; enabled: boolean; weight: number; missingDataPolicy: string; freshnessSeconds: number }
type CategoryConfig = { code: string; enabled: boolean; weight: number; parameters: ParameterConfig[] }
type Configuration = { id: string; version: number; status: string; thresholds: { allowMinimum: number; stepUpMinimum: number }; categories: CategoryConfig[]; createdBy: string; publishedBy?: string; publishedAt?: string }
type AuditEvent = { id: string; entity_id: string; action: string; actor_id: string; configuration_version: number; created_at: string }
type View = 'configuration' | 'evaluations' | 'activity'

const fallbackOptions = [
  { value: 'INCOMPLETE', label: 'Mark evaluation incomplete' },
  { value: 'FAIL_SAFE', label: 'Restrict access' },
  { value: 'NEUTRAL', label: 'Use a neutral score (50)' },
  { value: 'EXCLUDE', label: 'Exclude and adjust weights' },
]
const formatNumber = (value: number) => Number(value.toFixed(4)).toString()
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())

export default function TrustConfigurationPage({ platform = false }: { platform?: boolean }) {
  const { currentOrg, orgLoginId } = useCatalogue()
  const [organization, setOrganization] = useState('')
  const [master, setMaster] = useState<Master[]>([])
  const [masterEdits, setMasterEdits] = useState<Master[]>([])
  const [versions, setVersions] = useState<Configuration[]>([])
  const [draft, setDraft] = useState<Configuration | null>(null)
  const [view, setView] = useState<View>('configuration')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [simulation, setSimulation] = useState<Record<string, number>>({})
  const [evaluationId, setEvaluationId] = useState('')
  const [evaluation, setEvaluation] = useState<TrustScore | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const org = platform ? organization : currentOrg?.id || orgLoginId || ''
  const base = `/api/v1/organisations/${encodeURIComponent(org)}/trust-configurations`
  const editable = !!draft && ['DRAFT', 'VALIDATED'].includes(draft.status)
  const total = draft?.categories.filter(c => c.enabled).reduce((sum, c) => sum + Number(c.weight), 0) || 0
  const totalValid = Math.abs(total - 100) < 0.00001
  const subtotal = (category: CategoryConfig) => category.parameters.filter(p => p.enabled).reduce((sum, p) => sum + Number(p.weight), 0)
  const simulationScore = draft?.categories.filter(c => c.enabled).reduce((sum, c) => sum + c.weight / 100 * c.parameters.filter(p => p.enabled).reduce((value, p) => value + (simulation[p.code] ?? 50) * p.weight / 100, 0), 0) || 0
  const step = !draft || dirty || draft.status === 'DRAFT' ? 0 : draft.status === 'VALIDATED' ? 1 : 2

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Trust request failed.') } finally { setBusy(false) }
  }
  async function load(preferredId?: string) {
    if (!org) throw new Error('Select an organisation first.')
    const [categories, configurations, events] = await Promise.all([
      trustRequest<Master[]>('/api/v1/trust/master/categories'), trustRequest<Configuration[]>(base),
      trustRequest<AuditEvent[]>(`/api/v1/organisations/${encodeURIComponent(org)}/trust-audit`),
    ])
    setMaster(categories); setMasterEdits(categories); setVersions(configurations)
    setDraft(configurations.find(c => c.id === preferredId) || configurations.find(c => c.status === 'DRAFT' || c.status === 'VALIDATED') || configurations[0] || null)
    setAudit(events); setDirty(false)
  }
  useEffect(() => { if (org && !platform) void action(() => load()) }, [org])
  function changeCategory(code: string, update: Partial<CategoryConfig>) {
    if (!draft) return
    setDraft({ ...draft, categories: draft.categories.map(c => c.code === code ? { ...c, ...update } : c) }); setDirty(true)
  }
  function changeParameter(category: CategoryConfig, code: string, update: Partial<ParameterConfig>) {
    changeCategory(category.code, { parameters: category.parameters.map(p => p.code === code ? { ...p, ...update } : p) })
  }
  async function createDraft() {
    const created = await trustRequest<Configuration>(base, { method: 'POST' })
    await load(created.id); setView('configuration'); setNotice('Your draft is ready. Review the default weights, then validate and publish.')
  }
  async function save() {
    if (!draft) return
    const saved = await trustRequest<Configuration>(`${base}/${draft.id}`, { method: 'PUT', body: JSON.stringify({ thresholds: draft.thresholds, categories: draft.categories }) })
    await load(saved.id); setNotice('Changes saved. Validate this draft before publishing.')
  }
  async function validate() {
    if (!draft) return
    const result = await trustRequest<{ valid: boolean; errors: string[] }>(`${base}/${draft.id}/validate`, { method: 'POST' })
    await load(draft.id)
    if (!result.valid) throw new Error(result.errors.join('; '))
    setNotice('Validation passed. Your configuration is ready to publish.')
  }
  async function publish() {
    if (!draft) return
    await trustRequest(`${base}/${draft.id}/publish`, { method: 'POST' }); await load(draft.id)
    setNotice('Configuration published. New evaluations will use this version.')
  }
  async function loadEvaluation(id = evaluationId) {
    setEvaluation(null)
    const result = await trustRequest<TrustScore>(`/api/v1/trust/evaluations/${encodeURIComponent(id.trim())}`)
    setEvaluation(result); setEvaluationId(id); setView('evaluations')
  }

  return <div className="org-dashboard-shell org-console-shell trust-settings">
    {!platform && <OrgSidebar activeItem="Trust Configuration" />}
    <main className="org-main org-console-main">
      <OrgTopbar heading={platform ? 'Trust Management' : 'Trust Configuration'} subtitle="Manage how your organisation evaluates identity and session trust." />
      <section className="trust-content" aria-busy={busy}>
        <div className="trust-page-heading">
          <div><span className="trust-eyebrow">Security &amp; governance</span><h1>Trust configuration</h1><p>Choose your checks, set their importance and publish a configuration.</p></div>
          <div className="trust-toolbar">
            <button type="button" className="secondary-button" disabled={busy || !org} onClick={() => void action(() => load(draft?.id))}><RefreshCw size={16} className={busy ? 'trust-spinning' : ''} aria-hidden="true" />Refresh</button>
            <button type="button" className="primary-button" disabled={busy || !org} onClick={() => void action(createDraft)}><Plus size={17} aria-hidden="true" />New draft</button>
          </div>
        </div>

        {platform && <>
          <div className="trust-card trust-org-picker"><label className="trust-field">Organisation ID<input value={organization} placeholder="Enter an organisation ID" onChange={e => { setOrganization(e.target.value); setDraft(null); setVersions([]); setAudit([]); setEvaluation(null) }} /></label><button className="primary-button" disabled={busy || !org} onClick={() => void action(() => load())}>Load organisation</button><a href="/organization">Sign in</a></div>
          <details className="trust-card trust-advanced"><summary><SlidersHorizontal size={18} aria-hidden="true" /><span>Platform master defaults<small>Manage the starting values for new drafts</small></span><ChevronDown size={17} aria-hidden="true" /></summary><div className="trust-card-body"><p>Published organisation configurations keep their existing weights.</p><button className="secondary-button" disabled={busy} onClick={() => void action(async () => { const data = await trustRequest<Master[]>('/api/v1/trust/master/categories'); setMaster(data); setMasterEdits(data) })}>Load master list</button>
            {masterEdits.map(category => <fieldset key={category.code} className="trust-master-fields" disabled={busy}><legend>{category.name}</legend><div className="trust-field-grid">
              <label className="trust-field">Name<input value={category.name} onChange={e => setMasterEdits(masterEdits.map(c => c.code === category.code ? { ...c, name: e.target.value } : c))} /></label>
              <label className="trust-field">Default category weight (%)<input type="number" min="0" max="100" step="0.0001" value={category.defaultWeight} onChange={e => setMasterEdits(masterEdits.map(c => c.code === category.code ? { ...c, defaultWeight: Number(e.target.value) } : c))} /></label>
              <label className="trust-field trust-field-wide">Description<input value={category.description} onChange={e => setMasterEdits(masterEdits.map(c => c.code === category.code ? { ...c, description: e.target.value } : c))} /></label>
              {category.parameters.map(parameter => <label className="trust-field" key={parameter.code}>{parameter.name} weight (%)<input type="number" min="0" max="100" step="0.0001" value={parameter.defaultWeight} onChange={e => setMasterEdits(masterEdits.map(c => c.code === category.code ? { ...c, parameters: c.parameters.map(p => p.code === parameter.code ? { ...p, defaultWeight: Number(e.target.value) } : p) } : c))} /></label>)}
            </div><button className="secondary-button" onClick={() => void action(async () => { await trustRequest(`/api/v1/trust/master/categories/${category.code}`, { method: 'PUT', body: JSON.stringify(category) }); setNotice('Master defaults saved.') })}>Save defaults</button></fieldset>)}
          </div></details>
        </>}

        {error && <div role="alert" className="trust-message trust-message-error"><Info size={18} aria-hidden="true" /><span>{error}</span></div>}
        {notice && <div role="status" className="trust-message trust-message-success"><CheckCircle2 size={18} aria-hidden="true" /><span>{notice}</span></div>}

        <div className="trust-navigation">
          <nav className="trust-tabs" aria-label="Trust management sections">
            <button type="button" aria-pressed={view === 'configuration'} onClick={() => setView('configuration')}><SlidersHorizontal size={16} aria-hidden="true" />Configuration</button>
            <button type="button" aria-pressed={view === 'evaluations'} onClick={() => setView('evaluations')}><ShieldCheck size={16} aria-hidden="true" />Evaluations</button>
            <button type="button" aria-pressed={view === 'activity'} onClick={() => setView('activity')}><History size={16} aria-hidden="true" />Activity</button>
          </nav>
          <label className="trust-version-picker"><span>Version</span><select disabled={busy || !versions.length} value={draft?.id || ''} onChange={e => { setDraft(versions.find(v => v.id === e.target.value) || null); setDirty(false) }}><option value="" disabled>{versions.length ? 'Select a version' : 'No versions yet'}</option>{versions.map(v => <option key={v.id} value={v.id}>Version {v.version} - {label(v.status)}</option>)}</select></label>
        </div>

        {view === 'configuration' && <>
          <ol className="trust-workflow" aria-label="Configuration workflow">{[
            { title: 'Configure', text: 'Choose checks and weights' }, { title: 'Validate', text: 'Check your configuration' }, { title: 'Publish', text: 'Activate for evaluations' },
          ].map((item, index) => <li key={item.title} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''} aria-current={index === step ? 'step' : undefined}><span className="trust-step-number">{index < step ? <Check size={16} aria-hidden="true" /> : index + 1}</span><span><strong>{item.title}</strong><small>{item.text}</small></span>{index < 2 && <ArrowRight size={16} className="trust-step-arrow" aria-hidden="true" />}</li>)}</ol>

          {!draft && <div className="trust-card trust-empty">
            <span className="trust-empty-icon"><ShieldCheck size={32} aria-hidden="true" /></span>
            <h2>{busy ? 'Loading your configuration...' : 'Set up your first trust configuration'}</h2>
            <p>Start with recommended categories and weights. You can review and adjust them before making the configuration active.</p>
            <button type="button" className="primary-button" disabled={busy || !org} onClick={() => void action(createDraft)}><Plus size={17} aria-hidden="true" />Create first draft</button>
            <small>{org ? 'Your draft stays inactive until you validate and publish it.' : platform ? 'Load an organisation above to get started.' : 'Sign in as an organisation administrator to get started.'}</small>
          </div>}

          {draft && <div className="trust-editor-layout">
            <div className="trust-editor-main">
              <div className="trust-editor-heading"><div><h2>Categories &amp; checks</h2><p>Category weights total 100%. Checks within each category also total 100%.</p></div><span className={`trust-badge trust-badge-${dirty ? 'draft' : draft.status.toLowerCase()}`}>{dirty ? 'Unsaved changes' : label(draft.status)}</span></div>
              {!editable && <div className="trust-message trust-message-info"><LockKeyhole size={17} aria-hidden="true" /><span>This version is read-only. Create a new draft to change your configuration.</span></div>}
              {draft.categories.map((category, index) => {
                const definition = master.find(c => c.code === category.code)
                const parameterTotal = subtotal(category)
                const valid = !category.enabled || Math.abs(parameterTotal - 100) < 0.00001
                return <details key={`${draft.id}-${category.code}`} className={`trust-card trust-category ${category.enabled ? '' : 'is-excluded'}`} open={index === 0}>
                  <summary><span className="trust-category-icon"><ShieldCheck size={18} aria-hidden="true" /></span><span className="trust-category-title"><strong>{definition?.name || category.code}</strong><small>{category.parameters.filter(p => p.enabled).length} checks enabled{!category.enabled ? ' / Excluded from score' : ''}</small></span><span className="trust-category-weight">{formatNumber(Number(category.weight))}%<small>of total score</small></span><ChevronDown size={18} className="trust-chevron" aria-hidden="true" /></summary>
                  <div className="trust-category-body"><p>{definition?.description}</p><div className="trust-category-controls"><label className="trust-check-label"><input type="checkbox" disabled={!editable || busy} checked={category.enabled} onChange={e => changeCategory(category.code, { enabled: e.target.checked })} />Include in score</label><label className="trust-field">Category weight (%)<input disabled={!editable || busy} type="number" min="0" max="100" step="0.0001" value={category.weight} onChange={e => changeCategory(category.code, { weight: Number(e.target.value) })} /></label></div>
                    <div className={`trust-parameter-total ${valid ? 'is-valid' : 'is-invalid'}`}>{valid ? <CheckCircle2 size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}Check weights: {formatNumber(parameterTotal)}%{category.enabled && !valid ? ' - adjust to 100%' : ''}</div>
                    {category.parameters.map(parameter => {
                      const def = definition?.parameters.find(p => p.code === parameter.code)
                      return <fieldset className="trust-parameter" key={parameter.code} disabled={!editable || busy}><legend>{def?.name || parameter.code}</legend><div className="trust-parameter-description"><p>{def?.description}</p>{def?.mandatory && <span className="trust-mandatory"><LockKeyhole size={12} aria-hidden="true" />Required control</span>}</div>
                        <label className="trust-check-label"><input type="checkbox" disabled={def?.mandatory} checked={parameter.enabled} onChange={e => changeParameter(category, parameter.code, { enabled: e.target.checked })} />Enabled{def?.mandatory && <small>Always checked, regardless of category weight</small>}</label>
                        <div className="trust-parameter-fields"><label className="trust-field">Weight (%)<input type="number" min="0" max="100" step="0.0001" value={parameter.weight} onChange={e => changeParameter(category, parameter.code, { weight: Number(e.target.value) })} /></label><label className="trust-field">Evidence valid for (seconds)<input type="number" min="1" max={def?.freshnessSeconds} value={parameter.freshnessSeconds} onChange={e => changeParameter(category, parameter.code, { freshnessSeconds: Number(e.target.value) })} /></label><label className="trust-field">When evidence is missing<select disabled={def?.mandatory} value={parameter.missingDataPolicy} onChange={e => changeParameter(category, parameter.code, { missingDataPolicy: e.target.value })}>{fallbackOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label></div>
                        <small className="trust-source">Source: {def?.dataSource} / Scoring rule: {def?.scoringRule}</small>
                      </fieldset>
                    })}
                  </div>
                </details>
              })}
              <details className="trust-card trust-advanced"><summary><SlidersHorizontal size={18} aria-hidden="true" /><span>Preview calculation<small>Try sample scores before publishing</small></span><span className="trust-badge">{simulationScore.toFixed(2)} / 100</span><ChevronDown size={17} aria-hidden="true" /></summary><div className="trust-card-body"><p>Simulation only. Sample scores do not create an evaluation or change access permissions.</p><div className="trust-field-grid">{draft.categories.filter(c => c.enabled).flatMap(c => c.parameters.filter(p => p.enabled).map(p => <label className="trust-field" key={p.code}>{master.find(m => m.code === c.code)?.parameters.find(m => m.code === p.code)?.name || p.code}<input type="number" min="0" max="100" value={simulation[p.code] ?? 50} onChange={e => setSimulation({ ...simulation, [p.code]: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label>))}</div></div></details>
            </div>

            <aside className="trust-editor-aside" aria-label="Configuration summary and publishing">
              <div className="trust-card trust-summary"><div className="trust-card-heading"><h2>Configuration summary</h2><span className="trust-badge">Version {draft.version}</span></div><div className={`trust-weight-total ${totalValid ? 'is-valid' : 'is-invalid'}`}><span>Category weight total</span><strong>{formatNumber(total)}<small> / 100%</small></strong><p>{totalValid ? 'All category weights add up correctly.' : 'Adjust enabled category weights to reach 100%.'}</p></div><div className="trust-summary-counts"><span><strong>{draft.categories.filter(c => c.enabled).length}</strong>Categories</span><span><strong>{draft.categories.filter(c => c.enabled).reduce((sum, c) => sum + c.parameters.filter(p => p.enabled).length, 0)}</strong>Enabled checks</span></div><p className="trust-summary-note"><LockKeyhole size={15} aria-hidden="true" />Required security controls stay enforced independently of weights.</p></div>
              <div className="trust-card trust-thresholds"><div className="trust-card-heading"><h2>Decision thresholds</h2></div><p>Set the minimum score for each trust recommendation.</p><label className="trust-field">Allow from<input disabled={!editable || busy} type="number" min="0" max="100" step="0.0001" value={draft.thresholds.allowMinimum} onChange={e => { setDraft({ ...draft, thresholds: { ...draft.thresholds, allowMinimum: Number(e.target.value) } }); setDirty(true) }} /><small>Scores at or above this value may proceed, subject to other security checks.</small></label><label className="trust-field">Request extra verification from<input disabled={!editable || busy} type="number" min="0" max="100" step="0.0001" value={draft.thresholds.stepUpMinimum} onChange={e => { setDraft({ ...draft, thresholds: { ...draft.thresholds, stepUpMinimum: Number(e.target.value) } }); setDirty(true) }} /><small>Lower scores restrict access. This must be below the allow threshold.</small></label></div>
              <div className="trust-card trust-publish"><h2>{editable ? 'Ready for the next step?' : 'Published version'}</h2><p>{dirty ? 'Save your changes before validating.' : draft.status === 'VALIDATED' ? 'Validation passed. Publish to activate this version.' : editable ? 'Review the configuration, then validate it.' : 'Create a new draft to make changes.'}</p>{editable && <><button className="secondary-button" disabled={busy || !dirty} onClick={() => void action(save)}><Save size={16} aria-hidden="true" />Save draft</button><button className="secondary-button" disabled={busy || dirty} onClick={() => void action(validate)}><FileCheck2 size={16} aria-hidden="true" />Validate configuration</button><button className="primary-button" disabled={busy || dirty || draft.status !== 'VALIDATED'} onClick={() => void action(publish)}><Upload size={16} aria-hidden="true" />Publish version {draft.version}</button></>}<small>Created by {draft.createdBy}{draft.publishedBy ? ` / Published by ${draft.publishedBy}` : ''}{draft.publishedAt ? ` / ${new Date(draft.publishedAt).toLocaleString()}` : ''}</small></div>
            </aside>
          </div>}
        </>}

        {view === 'evaluations' && <div className="trust-card trust-evaluation"><div className="trust-section-title"><span className="trust-empty-icon"><ShieldCheck size={23} aria-hidden="true" /></span><div><h2>Look up an evaluation</h2><p>See the saved score, contributing checks and reasons for a decision.</p></div></div><form className="trust-lookup" onSubmit={e => { e.preventDefault(); void action(() => loadEvaluation()) }}><label className="trust-field">Evaluation ID<input required value={evaluationId} placeholder="Paste an evaluation ID" onChange={e => setEvaluationId(e.target.value)} /></label><button className="primary-button" disabled={busy || !evaluationId.trim()}><Search size={16} aria-hidden="true" />View evaluation</button></form>{evaluation ? <div className="trust-evaluation-result"><h3>{evaluation.finalScore.toFixed(2)} <small>/ 100</small></h3><TrustBreakdown score={evaluation} /></div> : <p className="trust-help"><Info size={16} aria-hidden="true" />You can also open an evaluation from the Activity section.</p>}</div>}

        {view === 'activity' && <div className="trust-card trust-activity"><div className="trust-card-heading"><div><h2>Recent activity</h2><p>Configuration changes and evaluation history for your organisation.</p></div><span className="trust-badge">{audit.length} events</span></div>{audit.length ? <ul>{audit.map(event => <li key={event.id}><span className="trust-activity-icon"><Clock3 size={17} aria-hidden="true" /></span><div><strong>{label(event.action.replace(/^TRUST_/, ''))}</strong><small>{event.actor_id} / {new Date(event.created_at).toLocaleString()}</small></div><span className="trust-badge">{event.configuration_version ? `Version ${event.configuration_version}` : 'Platform'}</span>{event.action === 'TRUST_EVALUATED' && event.entity_id && <button className="secondary-button" disabled={busy} onClick={() => void action(() => loadEvaluation(event.entity_id))}>View result<ArrowRight size={14} aria-hidden="true" /></button>}</li>)}</ul> : <div className="trust-small-empty"><History size={30} aria-hidden="true" /><h3>No activity yet</h3><p>Configuration changes and evaluations will appear here.</p></div>}</div>}
      </section>
    </main>
  </div>
}
