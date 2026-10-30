'use client'

import { ArrowRight, ArrowUpRight, Building2, Fingerprint, Layers3, ShieldCheck, UserCog } from 'lucide-react'
import { useCatalogue } from '../context/CatalogueContext'

const capabilities = [
  { icon: Building2, title: 'Organization onboarding', detail: 'Bring your organization and applications into one workspace.' },
  { icon: Fingerprint, title: 'Identity configuration', detail: 'Design registration, sign-in experiences, and access policies.' },
  { icon: ShieldCheck, title: 'Consent governance', detail: 'Organize data, define purposes, and manage notice templates.' },
]

export default function HomePage() {
  const { setView } = useCatalogue()

  return <div className="workspace-welcome">
    <header className="workspace-welcome__header">
      <div className="workspace-wordmark"><span><ShieldCheck size={22} strokeWidth={1.8} /></span><div><strong>Identity OS</strong><small>Identity &amp; consent workspace</small></div></div>
      <button type="button" className="secondary-button" onClick={() => setView('organization')}>Sign in <ArrowUpRight size={16} /></button>
    </header>
    <section className="workspace-welcome__hero" aria-labelledby="welcome-title">
      <div className="workspace-welcome__eyebrow"><Layers3 size={14} /> A connected identity workspace</div>
      <h1 id="welcome-title">One workspace.<br /><span>Every identity.</span></h1>
      <p>Bring your organization, identity experiences, and consent management together. Everything you need to build a trusted digital experience.</p>
      <div className="workspace-entry-grid">
        <button type="button" className="workspace-entry" onClick={() => setView('registration')}>
          <span className="workspace-entry__icon"><Building2 size={23} strokeWidth={1.7} /></span>
          <span className="workspace-entry__copy"><small>GET STARTED</small><strong>Register your organization</strong><span>Create your organization workspace and start onboarding.</span></span>
          <ArrowRight className="workspace-entry__arrow" size={20} />
        </button>
        <button type="button" className="workspace-entry" onClick={() => setView('organization')}>
          <span className="workspace-entry__icon"><UserCog size={23} strokeWidth={1.7} /></span>
          <span className="workspace-entry__copy"><small>WELCOME BACK</small><strong>Open your workspace</strong><span>Sign in to manage your organization and identity configuration.</span></span>
          <ArrowRight className="workspace-entry__arrow" size={20} />
        </button>
      </div>
    </section>
    <section className="workspace-capabilities" aria-label="Workspace capabilities">
      {capabilities.map(({ icon: Icon, title, detail }) => <article key={title}><Icon size={21} strokeWidth={1.6} /><h2>{title}</h2><p>{detail}</p></article>)}
    </section>
    <footer className="workspace-welcome__footer"><span>Identity OS</span><span>Organization &middot; Identity &middot; Consent</span></footer>
  </div>
}
