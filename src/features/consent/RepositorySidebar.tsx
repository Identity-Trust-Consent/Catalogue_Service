'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Database } from 'lucide-react'
import { consentAccess, currentConsentToken, repositoryPages, repositoryUrl } from './api'

export default function RepositorySidebar() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const refresh = () => setVisible(consentAccess(currentConsentToken()).read)
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('storage', refresh)
    const timer = window.setInterval(refresh, 30000)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  if (!visible) return null
  return <details className="repository-sidebar" open={pathname.startsWith('/organization/consent/') || undefined}>
    <summary><Database size={18} aria-hidden="true" /><span>Consent Management</span><ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="repository-sidebar-heading">Data Element Repository</div>
    {repositoryPages.map(page => <Link key={page.key} href={repositoryUrl(page.key)} aria-current={pathname === repositoryUrl(page.key) ? 'page' : undefined}>{page.title}</Link>)}
    <div className="repository-sidebar-heading">Consent History</div>
    <Link href="/organization/consent/consent-history" aria-current={pathname.startsWith('/organization/consent/consent-history') ? 'page' : undefined}>Consent History</Link>
    <Link href="/organization/consent/manage-consents" aria-current={pathname === '/organization/consent/manage-consents' ? 'page' : undefined}>Update / Revoke Consent</Link>
    <div className="repository-sidebar-heading">Notice Details</div>
    <Link href="/organization/consent/notice-preview" aria-current={pathname === '/organization/consent/notice-preview' ? 'page' : undefined}>Notice Preview</Link>
    <Link href="/organization/consent/notices" aria-current={pathname.startsWith('/organization/consent/notices') ? 'page' : undefined}>View Notice Details</Link>
  </details>
}
