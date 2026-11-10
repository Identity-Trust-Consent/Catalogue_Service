'use client'

import { orgAdminMenu } from '../../../data/mockCatalogueData'
import { AdminIcon } from '../../../components/ui'
import { useCatalogue } from '../context/CatalogueContext'
import RepositorySidebar from '../../consent/RepositorySidebar'

interface OrgSidebarProps {
  activeItem: string
}

export default function OrgSidebar({ activeItem }: OrgSidebarProps) {
  const { setView } = useCatalogue()

  const handleClick = (item: string) => {
    if (item === 'Dashboard') setView('organization-dashboard')
    if (item === 'Registration Builder') setView('org-registration-builder')
    if (item === 'Login Configuration') setView('org-login-builder')
    if (item === 'All Users Details') setView('org-users')
    if (item === 'Audit Logs') setView('org-audit-logs')
  }

  const iconFor = (item: string) => {
    if (item === 'Registration Builder') return 'schema'
    if (item === 'Login Configuration') return 'auth'
    if (item === 'All Users Details') return 'identity'
    if (item === 'Audit Logs') return 'audit'
    if (item === 'Setting') return 'security'
    return 'dashboard'
  }

  return (
    <aside className="org-sidebar org-admin-sidebar">
      <div className="org-sidebar-brand">
        <span className="platform-brand-icon"><AdminIcon name="shield" /></span>
        <span><strong>Identity OS</strong><small>Admin Console</small></span>
      </div>
      <nav aria-label="Organization navigation">
        {orgAdminMenu.map((item) => item === 'Consent Management' ? (
          <RepositorySidebar key={item} />
        ) : (
          <button type="button" key={item} aria-current={item === activeItem ? 'page' : undefined} className={`menu-item ${item === activeItem ? 'active' : ''}`} onClick={() => handleClick(item)}>
            <span className="nav-item-label"><AdminIcon name={iconFor(item)} />{item}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
