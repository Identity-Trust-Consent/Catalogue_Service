'use client'

import { UserCog } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { useCatalogue } from '../context/CatalogueContext'

export default function OrganizationLoginPage() {
  const { handleOrgLoginSubmit, orgLoginChannel, orgLoginError, orgLoginId, orgLoginMaskedEmail, orgLoginStage, orgOtp, setOrgLoginChannel, setOrgLoginId, setOrgOtp, setView } = useCatalogue()
  return (
    <section className="panel-page org-login-shell">
      <PageHeader title="Identity OS" onBack={() => setView('home')} />
      <div className="org-login-layout">
        <aside className="org-login-visual">
          <span className="login-shield role-icon role-icon-white">
            <UserCog size={28} strokeWidth={2} />
          </span>
          <h1>Organization Admin</h1>
          <p>Access your dedicated identity workspace with verified organization credentials.</p>
          <div className="login-security-list"><span>Official email OTP</span><span>Keycloak protected session</span><span>Organization scoped dashboard</span></div>
        </aside>
        <div className="org-login-card form-card narrow">
          <div className="progress-indicator three-step login-progress">{[1, 2, 3].map((n) => <span key={n} className={`progress-dot ${orgLoginStage === n ? 'active' : ''}`}>{n}</span>)}</div>
          <div className="panel-copy compact login-copy"><h2>{orgLoginStage === 1 && 'Enter organization ID'}{orgLoginStage === 2 && 'Verify official email'}{orgLoginStage === 3 && 'Confirm OTP'}</h2><p>{orgLoginStage === 1 && 'Use the organization ID generated during registration.'}{orgLoginStage === 2 && 'We will send a one-time code to the official email on record.'}{orgLoginStage === 3 && 'Enter the six-digit code to continue to Keycloak login.'}</p></div>
          {orgLoginStage === 1 && <><div className="step-row"><label>ORGANIZATION ID<input value={orgLoginId} onChange={(e) => setOrgLoginId(e.target.value)} placeholder="org_xxxxxxxx" /></label></div>{orgLoginError && <div className="error-message">{orgLoginError}</div>}<button type="button" className="primary-button login-submit" onClick={handleOrgLoginSubmit}>Continue</button></>}
          {orgLoginStage === 2 && <><div className="channel-list"><button type="button" className={`channel-option ${orgLoginChannel === 'email' ? 'selected' : ''}`} onClick={() => setOrgLoginChannel('email')}>Email OTP to official email {orgLoginMaskedEmail || ''}</button></div>{orgLoginError && <div className="error-message">{orgLoginError}</div>}<button type="button" className="primary-button" onClick={handleOrgLoginSubmit}>Send OTP</button></>}
          {orgLoginStage === 3 && <><div className="step-row"><label>ENTER OTP<input value={orgOtp} onChange={(e) => setOrgOtp(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} /></label></div>{orgLoginMaskedEmail && <p className="hint-text">OTP sent to official email {orgLoginMaskedEmail}.</p>}{orgLoginError && <div className="error-message">{orgLoginError}</div>}<button type="button" className="primary-button" onClick={handleOrgLoginSubmit}>Verify OTP</button><p className="hint-text">The OTP expires shortly and has limited attempts.</p></>}
        </div>
      </div>
    </section>
  )
}
