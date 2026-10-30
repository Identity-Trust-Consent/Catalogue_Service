'use client'

import { AdminIcon } from '../../../components/ui'
import type { ApplicationRecord, Organization, SchemaRecord } from '../../../types/catalogue'
import type { CatalogueView } from '../routes'
import RepositorySidebar from '../../consent/RepositorySidebar'

interface PlatformSidebarProps {
  applications: ApplicationRecord[]
  currentView: string
  onNavigate: (view: CatalogueView) => void
  pendingOrganizations: Organization[]
  schemas: SchemaRecord[]
}

const navSections = [
  { title: null, items: [
    { label: 'Dashboard', key: 'platform-dashboard', icon: 'dashboard' },
  ] },
  {
    title: 'Management',
    items: [
      { label: 'Organizations', key: 'platform-organizations', icon: 'organizations', badgeKey: 'orgs' },
      { label: 'Applications', key: 'platform-apps', icon: 'applications', badgeKey: 'apps' },
      { label: 'Schema Approvals', key: 'platform-schema', icon: 'schema', badgeKey: 'schemas' },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Identity Management', key: 'platform-identity-mgmt', icon: 'identity' },
      { label: 'Auth Monitoring', key: 'platform-auth-monitor', icon: 'auth' },
      { label: 'Audit Logs', key: 'platform-audit', icon: 'audit' },
      { label: 'Security Monitoring', key: 'platform-security-monitor', icon: 'security' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'API Management', key: 'platform-api', icon: 'api' },
      { label: 'Trust Management', key: 'platform-trust', icon: 'trust' },
      { label: 'Reports', key: 'platform-reports', icon: 'reports' },
      { label: 'Notifications', key: 'platform-notifications', icon: 'notifications' },
    ],
  },
] as const

export default function PlatformSidebar({
  applications,
  currentView,
  onNavigate,
  pendingOrganizations,
  schemas,
}: PlatformSidebarProps) {
  const badges = {
    orgs: pendingOrganizations.length,
    apps: applications.filter((app) => app.status === 'pending').length,
    schemas: schemas.filter((schema) => schema.status === 'pending').length,
  }

  return (
    <aside className="side-nav">
      <div className="brand-block">
        <span className="platform-brand-icon"><AdminIcon name="shield" /></span>
        <span><strong>Identity OS</strong><small>Platform Admin</small></span>
      </div>
      {navSections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="nav-section">
          {section.title && <div className="nav-section-title">{section.title}</div>}
          <ul>
            {section.items.map((item) => {
              const badge = 'badgeKey' in item ? badges[item.badgeKey] : 0
              return (
                <li
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={currentView === item.key ? 'active' : ''}
                >
                  <span className="nav-item-label"><AdminIcon name={item.icon} />{item.label}</span>
                  {badge ? <span className="nav-badge">{badge}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <RepositorySidebar />
    </aside>
  )
}
