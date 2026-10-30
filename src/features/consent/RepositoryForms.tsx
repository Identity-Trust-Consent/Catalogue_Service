'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { allElements, consentRequest, languageNames, repositoryUrl, type ElementRecord } from './api'
import SetupProgress from './SetupProgress'

function RequiredLabel({ children, required = true }: { children: ReactNode; required?: boolean }) {
  return <span>{children}{required && <span className="repository-required-mark" aria-hidden="true"> *</span>}</span>
}

export function RepositoryDialog({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="repository-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="repository-dialog-title"><h2>{title}</h2><button type="button" disabled={busy} aria-label="Close dialog" onClick={onClose}>×</button></div>
    {children}
  </dialog>
}

export function Translations({ value = {}, onChange, fields = ['name', 'description'] }: { value: ElementRecord; onChange: (next: ElementRecord) => void; fields?: string[] }) {
  const [language, setLanguage] = useState('hi')
  return <div className="repository-translations">
    <div className="repository-inline"><label>Language<select value={language} onChange={event => setLanguage(event.target.value)}>{Object.entries(languageNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button type="button" className="secondary-button" onClick={() => onChange({ ...value, [language]: value[language] || {} })}>Add translation</button></div>
    {Object.entries(value).map(([code, translation]) => <fieldset key={code} className="repository-card"><legend>{languageNames[code] || code}</legend>
      {fields.map(field => <label key={field}>{field.replace(/([A-Z])/g, ' $1')}<textarea rows={2} value={translation?.[field] || ''} onChange={event => onChange({ ...value, [code]: { ...translation, [field]: event.target.value } })} /></label>)}
      <button className="repository-danger" type="button" onClick={() => { const next = { ...value }; delete next[code]; onChange(next) }}>Remove {languageNames[code]}</button>
    </fieldset>)}
  </div>
}

type Props = { resource: string; initial: ElementRecord | null; readOnly: boolean; busy: boolean; error: string; onSave: (body: ElementRecord) => Promise<void>; onClose: () => void }
export default function RepositoryForm({ resource, initial, readOnly, busy, error, onSave, onClose }: Props) {
  const [data, setData] = useState<ElementRecord>(() => structuredClone(initial || { name: '', code: Math.random().toString(36).slice(2, 12).toUpperCase(), active: true, pii: false, description: '', status: 'draft', translations: {}, processingPurposes: [] }))
  const [step, setStep] = useState(0)
  const [masters, setMasters] = useState<Record<string, ElementRecord[]>>({})
  const [lookupError, setLookupError] = useState('')
  const [loading, setLoading] = useState(false)
  const [targets, setTargets] = useState<number[]>([])
  const [affected, setAffected] = useState<ElementRecord[]>([])
  const form = useRef<HTMLFormElement>(null)
  const isPurpose = resource === 'consent-purposes'
  const isTemplate = resource === 'notice-templates'
  const steps = isPurpose ? ['General Settings', 'Processing Activities', 'Processor Mappings', 'Translations', 'Review & Publish'] : isTemplate ? ['General Settings', 'Purposes & Rules', 'Legal Documents', 'Translations', 'Review & Publish'] : []
  const patch = (next: ElementRecord) => setData(current => ({ ...current, ...next }))
  const children: ElementRecord[] = data.processingPurposes || []
  const changeChild = (index: number, next: ElementRecord) => patch({ processingPurposes: children.map((child, i) => i === index ? { ...child, ...next, ...(next.userAttributeNames ? { dataProcessors: (child.dataProcessors || []).map((mapping: ElementRecord) => ({ ...mapping, userAttributeNames: mapping.userAttributeNames.filter((name: string) => next.userAttributeNames.includes(name)) })) } : {}) } : child) })
  const signature = (entries: ElementRecord[]) => entries.map(child => ({ id: child.id, name: child.name, description: child.description, purposeOfProcessingId: child.purposeOfProcessingId, userAttributeNames: [...(child.userAttributeNames || [])].sort() }))
  const hasStructuralChange = JSON.stringify(signature(initial?.processingPurposes || [])) !== JSON.stringify(signature(children))
  const loadMasters = async () => {
    setLoading(true); setLookupError('')
    try {
      const names = isTemplate ? ['business-units', 'consent-purposes'] : ['user-attributes', 'purposes-of-processing', 'data-processors']
      const values = await Promise.all(names.map(async name => [name, await allElements(name)] as const))
      const next = Object.fromEntries(values)
      if (isTemplate) next['consent-purposes'] = await Promise.all(next['consent-purposes'].filter(purpose => purpose.status === 'published').map(purpose => consentRequest(`repository/consent-purposes/${purpose.id}`)))
      setMasters(next)
      if (isPurpose && initial?.id) setAffected(await consentRequest(`repository/consent-purposes/${initial.id}/affected-templates`))
    } catch (failure) { setLookupError(failure instanceof Error ? failure.message : 'Unable to load reference data.') }
    finally { setLoading(false) }
  }
  useEffect(() => { if (isPurpose || isTemplate) void loadMasters() }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly || busy || loading || lookupError) return
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    let body: ElementRecord
    if (resource === 'business-units') body = { name: data.name, code: data.code, active: data.active }
    else if (resource === 'user-attributes') body = { name: data.name, pii: data.pii, supportedLanguages: data.supportedLanguages || ['en'], translations: data.translations || {} }
    else if (resource === 'purposes-of-processing') body = { name: data.name, code: data.code, description: data.description }
    else if (resource === 'data-processors') body = { ouId: data.ouId, legalName: data.legalName, brandName: data.brandName, cin: data.cin, industry: data.industry, active: data.active }
    else if (isPurpose) body = { name: data.name, code: data.code, description: data.description, status: button?.value || 'draft', translations: data.translations || {},
      processingPurposes: children.map(child => ({ id: child.id, name: child.name, description: child.description, purposeOfProcessingId: Number(child.purposeOfProcessingId), userAttributeNames: child.userAttributeNames || [], translations: child.translations || {}, dataProcessors: (child.dataProcessors || []).map((mapping: ElementRecord) => ({ dataProcessorId: mapping.dataProcessorId, userAttributeNames: mapping.userAttributeNames })) })), propagateToBPIds: hasStructuralChange && button?.value === 'published' ? targets : [] }
    else body = { name: data.name, code: data.code, businessUnitId: Number(data.businessUnitId), grantDescription: data.grantDescription, revokeDescription: data.revokeDescription || '', reconsentDescription: data.reconsentDescription || '', status: button?.value || 'draft', template: data.template || 'default', defaultLanguage: data.defaultLanguage || 'en', translations: data.translations || {}, legalDocuments: data.legalDocuments || {}, consentPurposes: data.consentPurposes || [] }
    await onSave(body)
  }

  const general = <div className="repository-form-grid">
    {resource === 'data-processors' ? <>
      <label><RequiredLabel>OU ID</RequiredLabel><input required maxLength={50} readOnly={!!initial} value={data.ouId || ''} onChange={event => patch({ ouId: event.target.value })} /></label>
      <label><RequiredLabel>Legal name</RequiredLabel><input required minLength={3} maxLength={255} value={data.legalName || ''} onChange={event => patch({ legalName: event.target.value })} /></label>
      <label><RequiredLabel>Brand name</RequiredLabel><input required minLength={3} maxLength={255} value={data.brandName || ''} onChange={event => patch({ brandName: event.target.value })} /></label>
      <label><RequiredLabel>CIN</RequiredLabel><input required maxLength={21} value={data.cin || ''} onChange={event => patch({ cin: event.target.value })} /></label>
      <label><RequiredLabel>Industry</RequiredLabel><select required value={data.industry || ''} onChange={event => patch({ industry: event.target.value })}><option value="">Select industry</option>{data.industry && !['gaming', 'banking', 'finance', 'healthcare', 'retail', 'technology', 'telecommunications', 'education', 'manufacturing', 'other'].includes(data.industry) && <option value={data.industry}>{data.industry}</option>}{['gaming', 'banking', 'finance', 'healthcare', 'retail', 'technology', 'telecommunications', 'education', 'manufacturing', 'other'].map(industry => <option key={industry}>{industry}</option>)}</select></label>
    </> : <label className="repository-wide"><RequiredLabel>Name</RequiredLabel><input required minLength={3} maxLength={resource === 'user-attributes' ? undefined : 255} value={data.name || ''} onChange={event => patch({ name: event.target.value })} /></label>}
    {['business-units', 'data-processors'].includes(resource) && <label className="repository-check"><input type="checkbox" checked={!!data.active} onChange={event => patch({ active: event.target.checked })} />Active</label>}
    {resource === 'user-attributes' && <label className="repository-check"><input type="checkbox" checked={!!data.pii} onChange={event => patch({ pii: event.target.checked })} />Contains personal information (PII)</label>}
    {['purposes-of-processing', 'consent-purposes'].includes(resource) && <label className="repository-wide"><RequiredLabel>Description</RequiredLabel><textarea required minLength={isPurpose ? 8 : 1} maxLength={1000} rows={4} value={data.description || ''} onChange={event => patch({ description: event.target.value })} /></label>}
    {isTemplate && <>
      <label><RequiredLabel>Organization</RequiredLabel><select required value={data.businessUnitId || ''} onChange={event => patch({ businessUnitId: Number(event.target.value) })}><option value="">Select organization</option>{(masters['business-units'] || []).filter(unit => unit.active || unit.id === data.businessUnitId).map(unit => <option value={unit.id} key={unit.id}>{unit.name}{unit.active ? '' : ' (inactive)'}</option>)}</select></label>
      <label>Layout<select value={data.template || 'default'} onChange={event => patch({ template: event.target.value })}><option value="default">Default</option><option value="processing-purpose-only">Processing purpose only</option><option value="mandatory-non-mandatory-split">Mandatory / optional split</option></select></label>
      {['grantDescription', 'revokeDescription', 'reconsentDescription'].map(field => <label className="repository-wide" key={field}><RequiredLabel required={field === 'grantDescription'}>{field.replace(/([A-Z])/g, ' $1')}</RequiredLabel><textarea required={field === 'grantDescription'} minLength={field === 'grantDescription' ? 8 : undefined} maxLength={field === 'grantDescription' ? 1000 : undefined} value={data[field] || ''} onChange={event => patch({ [field]: event.target.value })} /></label>)}
    </>}
  </div>

  return <form ref={form} className="repository-form" onSubmit={submit}>
    {!readOnly && <p className="repository-required-hint"><span className="repository-required-mark" aria-hidden="true">*</span> Required fields</p>}
    {steps.length > 0 && <SetupProgress compact title={isPurpose ? 'Purpose configuration' : 'Notice template configuration'} steps={steps.map(label => ({ label }))} currentIndex={step} disabled={busy || loading} onSelect={index => { if (index < step || readOnly || form.current?.reportValidity()) setStep(index) }} />}
    {lookupError && <div className="repository-error" role="alert">{lookupError}<button type="button" onClick={loadMasters}>Retry loading reference data</button></div>}
    {loading && <p role="status">Loading reference data…</p>}
    <fieldset disabled={readOnly || busy || loading || !!lookupError} className="repository-fields">
      {(!steps.length || step === 0) && general}
      {readOnly && (!steps.length || step === 0) && <dl className="repository-summary"><dt>Identifier</dt><dd>{data.publicId || data.ouId || data.id}</dd>{data.version && <><dt>Version</dt><dd>v{data.version}</dd></>}<dt>Created</dt><dd>{data.createdAt ? new Date(data.createdAt).toLocaleString() : '—'}</dd><dt>Updated</dt><dd>{data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '—'}</dd></dl>}
      {isPurpose && step === 1 && <>
        <p>Select processing activities and the data attributes each activity uses.</p>
        {children.map((child, index) => <fieldset key={index} className="repository-card"><legend>Processing activity {index + 1}</legend>
          <div className="repository-form-grid"><label><RequiredLabel>Purpose Sub Master</RequiredLabel><select required value={child.purposeOfProcessingId || ''} onChange={event => { const selected = (masters['purposes-of-processing'] || []).find(item => item.id === Number(event.target.value)); changeChild(index, { purposeOfProcessingId: Number(event.target.value), name: selected?.name || '', description: selected?.description || '' }) }}><option value="">Select purpose</option>{(masters['purposes-of-processing'] || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><RequiredLabel>Activity name</RequiredLabel><input required value={child.name || ''} onChange={event => changeChild(index, { name: event.target.value })} /></label>
            <label className="repository-wide"><RequiredLabel>Description</RequiredLabel><textarea required minLength={8} maxLength={2000} value={child.description || ''} onChange={event => changeChild(index, { description: event.target.value })} /></label></div>
          <div className="repository-choices" role="group" aria-label="Data attributes">{(masters['user-attributes'] || []).map(attribute => <label key={attribute.id} className="repository-check"><input type="checkbox" checked={(child.userAttributeNames || []).includes(attribute.name)} onChange={event => changeChild(index, { userAttributeNames: event.target.checked ? [...(child.userAttributeNames || []), attribute.name] : child.userAttributeNames.filter((name: string) => name !== attribute.name) })} />{attribute.name}{attribute.pii && <small>PII</small>}</label>)}</div>
          <button type="button" className="repository-danger" onClick={() => patch({ processingPurposes: children.filter((_, i) => i !== index) })}>Remove processing activity</button>
        </fieldset>)}
        <button type="button" className="secondary-button" onClick={() => patch({ processingPurposes: [...children, { name: '', description: '', userAttributeNames: [], dataProcessors: [], translations: {} }] })}>+ Add processing activity</button>
      </>}
      {isPurpose && step === 2 && <>
        <div className="repository-inline"><p>Map optional data processors to each activity and select the attributes shared with them.</p><a href={repositoryUrl('data-processors')} target="_blank" rel="noopener noreferrer">Manage processors</a><button type="button" onClick={loadMasters}>Refresh choices</button></div>
        {!children.length && <p>Add a processing activity in the previous step.</p>}
        {children.map((child, index) => <fieldset key={index} className="repository-card"><legend>{child.name || `Activity ${index + 1}`}</legend>
          {(child.dataProcessors || []).map((mapping: ElementRecord, mapIndex: number) => <div key={mapIndex} className="repository-card">
            <label><RequiredLabel>Data processor</RequiredLabel><select required value={mapping.dataProcessorId || ''} onChange={event => changeChild(index, { dataProcessors: child.dataProcessors.map((entry: ElementRecord, i: number) => i === mapIndex ? { ...entry, dataProcessorId: event.target.value } : entry) })}><option value="">Select processor</option>{(masters['data-processors'] || []).filter(item => item.active || item.ouId === mapping.dataProcessorId).map(item => <option key={item.ouId} value={item.ouId}>{item.brandName} ({item.ouId}){item.active ? '' : ' (inactive)'}</option>)}</select></label>
            <div className="repository-choices">{(child.userAttributeNames || []).map((name: string) => <label className="repository-check" key={name}><input type="checkbox" checked={mapping.userAttributeNames?.includes(name) || false} onChange={event => { const names = event.target.checked ? [...(mapping.userAttributeNames || []), name] : mapping.userAttributeNames.filter((entry: string) => entry !== name); changeChild(index, { dataProcessors: child.dataProcessors.map((entry: ElementRecord, i: number) => i === mapIndex ? { ...entry, userAttributeNames: names } : entry) }) }} />{name}</label>)}</div>
            <button type="button" className="repository-danger" onClick={() => changeChild(index, { dataProcessors: child.dataProcessors.filter((_: unknown, i: number) => i !== mapIndex) })}>Remove mapping</button>
          </div>)}
          <button type="button" onClick={() => changeChild(index, { dataProcessors: [...(child.dataProcessors || []), { dataProcessorId: '', userAttributeNames: [] }] })}>+ Map processor</button>
        </fieldset>)}
      </>}
      {isTemplate && step === 1 && <TemplatePurposeEditor value={data.consentPurposes || []} onChange={value => patch({ consentPurposes: value })} purposes={masters['consent-purposes'] || []} readOnly={readOnly} />}
      {isTemplate && step === 2 && <LegalDocuments value={data.legalDocuments || {}} onChange={value => patch({ legalDocuments: value })} />}
      {(isPurpose || isTemplate) && step === 3 && <>
        <h3>{isPurpose ? 'Purpose translations' : 'Notice translations'}</h3>
        <Translations value={data.translations || {}} onChange={value => patch({ translations: value })} fields={isTemplate ? ['name', 'grantDescription', 'revokeDescription', 'reconsentDescription'] : undefined} />
        {isPurpose && children.map((child, index) => <div className="repository-card" key={index}><h3>{child.name || `Activity ${index + 1}`}</h3><Translations value={child.translations || {}} onChange={value => changeChild(index, { translations: value })} /></div>)}
      </>}
      {(isPurpose || isTemplate) && step === 4 && <>
        <dl className="repository-summary"><dt>Name</dt><dd>{data.name}</dd><dt>Description</dt><dd>{data.description || data.grantDescription}</dd><dt>Configuration</dt><dd>{isPurpose ? `${children.length} processing activities` : `${(data.consentPurposes || []).length} consent purposes`}</dd><dt>Languages</dt><dd>{['en', ...Object.keys(data.translations || {}).filter(key => key !== 'en')].map(key => languageNames[key]).join(', ')}</dd></dl>
        {initial?.status === 'published' && isPurpose && <div className="repository-notice"><p>Changing processing activities creates a new purpose version. Existing versions and notice templates are preserved.</p>{hasStructuralChange && affected.length > 0 && <fieldset><legend>Apply the new published purpose version to selected templates</legend>{affected.map(template => <label key={template.id} className="repository-check"><input type="checkbox" checked={targets.includes(template.id)} onChange={event => setTargets(event.target.checked ? [...targets, template.id] : targets.filter(id => id !== template.id))} />{template.name} · v{template.version}</label>)}<small>Each selected template receives a new version when you publish.</small></fieldset>}</div>}
        <p>Save a draft to continue later, or publish to make this configuration available for notice templates.</p>
      </>}
    </fieldset>
    {error && <p role="alert" className="repository-error">{error}</p>}
    <footer className="repository-form-actions">
      <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
      {step > 0 && <button type="button" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
      {!!steps.length && step < 4 && <button type="button" className="primary-button" disabled={busy || loading || !!lookupError} onClick={() => { if (readOnly || form.current?.reportValidity()) setStep(step + 1) }}>Next</button>}
      {!readOnly && (!steps.length || step === 4) && <>
        <button type="submit" className={steps.length ? 'secondary-button' : 'primary-button'} name="intent" value="draft" disabled={busy || loading || !!lookupError}>{busy ? 'Saving…' : steps.length ? 'Save Draft' : 'Save'}</button>
        {!!steps.length && <button type="submit" className="primary-button" name="intent" value="published" disabled={busy || loading || !!lookupError}>{busy ? 'Saving…' : 'Publish'}</button>}
      </>}
    </footer>
  </form>
}

function LegalDocuments({ value, onChange }: { value: ElementRecord; onChange: (value: ElementRecord) => void }) {
  const [title, setTitle] = useState(''); const [url, setUrl] = useState(''); const [error, setError] = useState('')
  return <div><p>Add links to privacy policies, terms, and other legal documents.</p>{Object.entries(value).map(([name, link]) => <div className="repository-inline repository-card" key={name}><a href={link} target="_blank" rel="noopener noreferrer">{name}</a><button type="button" className="repository-danger" onClick={() => { const next = { ...value }; delete next[name]; onChange(next) }}>Remove</button></div>)}
    <label>Document title<input value={title} onChange={event => setTitle(event.target.value)} /></label><label>Document URL<input type="url" value={url} onChange={event => setUrl(event.target.value)} /></label>
    <button type="button" onClick={() => { try { const parsed = new URL(url); if (!title.trim() || !['http:', 'https:'].includes(parsed.protocol)) throw new Error(); onChange({ ...value, [title.trim()]: url }); setTitle(''); setUrl(''); setError('') } catch { setError('Enter a title and a valid HTTP or HTTPS URL.') } }}>Add document</button>{error && <p role="alert">{error}</p>}
  </div>
}

function TemplatePurposeEditor({ value, onChange, purposes, readOnly }: { value: ElementRecord[]; onChange: (value: ElementRecord[]) => void; purposes: ElementRecord[]; readOnly: boolean }) {
  const setConfig = (index: number, patch: ElementRecord) => onChange(value.map((entry, i) => i === index ? { ...entry, ...patch } : entry))
  return <div>{value.map((config, index) => <fieldset key={index} className="repository-card"><legend>Consent purpose {index + 1}</legend>
    <label><RequiredLabel>Published purpose</RequiredLabel><select required value={config.consentPurposeId || ''} onChange={event => { const purpose = purposes.find(item => item.id === Number(event.target.value)); setConfig(index, { consentPurposeId: purpose?.id, processingRules: (purpose?.processingPurposes || []).map((rule: ElementRecord) => ({ processingPurposeId: rule.id, isMandatory: false, isReconsentable: false, isRevocable: false })) }) }}><option value="">Select purpose</option>{purposes.map(purpose => <option key={purpose.id} value={purpose.id}>{purpose.name} · v{purpose.version}</option>)}</select></label>
    <label>Consent duration<select value={config.durationType || 'until_purpose_met'} onChange={event => setConfig(index, { durationType: event.target.value, consentDuration: undefined, durationUnit: undefined })}><option value="until_purpose_met">Until purpose is met</option><option value="custom_duration">Custom duration</option></select></label>
    {config.durationType === 'custom_duration' && <div className="repository-inline"><label><RequiredLabel>Duration</RequiredLabel><input required type="number" min="0.000001" step="any" value={config.consentDuration ?? ''} onChange={event => setConfig(index, { consentDuration: Number(event.target.value) })} /></label><label><RequiredLabel>Unit</RequiredLabel><select required value={config.durationUnit || ''} onChange={event => setConfig(index, { durationUnit: event.target.value })}><option value="">Select unit</option>{['minutes', 'hours', 'days', 'weeks', 'months', 'years'].map(unit => <option key={unit}>{unit}</option>)}</select></label></div>}
    {(config.processingRules || []).map((rule: ElementRecord, ruleIndex: number) => { const source = purposes.find(purpose => purpose.id === config.consentPurposeId)?.processingPurposes?.find((entry: ElementRecord) => entry.id === rule.processingPurposeId); const update = (patch: ElementRecord) => setConfig(index, { processingRules: config.processingRules.map((entry: ElementRecord, i: number) => i === ruleIndex ? { ...entry, ...patch } : entry) }); return <div className="repository-card" key={ruleIndex}><strong>{source?.name || `Processing activity ${rule.processingPurposeId}`}</strong><div className="repository-choices">{['isMandatory', 'isReconsentable', 'isRevocable'].map(flag => <label className="repository-check" key={flag}><input type="checkbox" checked={!!rule[flag]} onChange={event => update({ [flag]: event.target.checked })} />{flag.replace('is', '').replace(/([A-Z])/g, ' $1').trim()}</label>)}</div>
      {!readOnly && <div className="repository-inline"><label>Retention duration (optional)<input type="number" min="0.000001" step="any" value={rule.retentionDurationValue ?? ''} onChange={event => update(event.target.value ? { retentionDurationValue: Number(event.target.value), retentionDurationUnit: rule.retentionDurationUnit || 'days' } : { retentionDurationValue: undefined, retentionDurationUnit: undefined })} /></label>{rule.retentionDurationValue && <label>Unit<select value={rule.retentionDurationUnit || 'days'} onChange={event => update({ retentionDurationUnit: event.target.value })}>{['days', 'weeks', 'months', 'years'].map(unit => <option key={unit}>{unit}</option>)}</select></label>}</div>}
      {readOnly && <p>Retention duration: {rule.retentionDuration == null ? 'Not configured' : `${rule.retentionDuration} hours`}</p>}
    </div> })}
    <button type="button" className="repository-danger" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove purpose</button>
  </fieldset>)}<button type="button" className="secondary-button" onClick={() => onChange([...value, { durationType: 'until_purpose_met', processingRules: [] }])}>+ Add consent purpose</button></div>
}
