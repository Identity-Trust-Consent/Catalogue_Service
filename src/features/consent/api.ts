import keycloak from '../../lib/keycloak'

import { apiPath, type ElementRecord } from './config'
export * from './config'

export function consentAccess(token: string | undefined) {
  try {
    const payload = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const roles: string[] = payload.realm_access?.roles || []
    const write = roles.some(role => ['privy_cgp_admin', 'privy_cgp_user', 'PLATFORM_ADMIN', 'ORGANISATION_ADMIN', 'APPLICATION_SUPER_ADMIN'].includes(role))
    return { read: Number(payload.exp) * 1000 > Date.now() && (write || roles.some(role => ['privy_auditor', 'privy_data_protection_officer'].includes(role))), write: Number(payload.exp) * 1000 > Date.now() && write }
  } catch { return { read: false, write: false } }
}

export function currentConsentToken() {
  if (keycloak.token) return keycloak.token
  try { return localStorage.getItem('identity_os_hosted_admin_token') || undefined } catch { return undefined }
}

export async function consentRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  if (keycloak.authenticated) await keycloak.updateToken(30)
  const token = currentConsentToken()
  if (!token) throw new Error('Sign in to Identity OS to manage consent data.')
  const response = await fetch(`/api/consent/${path}`, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.errors ? Object.entries(body.errors).map(([key, value]) => `${key}: ${value}`).join('; ') : body.detail || body.message || (response.status === 403 ? 'Your account does not have permission for this operation.' : `Consent request failed (${response.status}).`))
  return body as T
}

export async function allElements(resource: string) {
  const result: ElementRecord[] = []
  let offset = 0
  while (true) {
    const page = await consentRequest<{ items: ElementRecord[]; total: number }>(`${apiPath(resource)}?offset=${offset}&limit=1000`)
    result.push(...page.items); offset += page.items.length
    if (!page.items.length || offset >= page.total) return result
  }
}
