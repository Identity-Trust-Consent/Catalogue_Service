import keycloak from '../../lib/keycloak'

export interface TrustSignal { code: string; status: string; reasonCode: string; score: number | null; effectiveWeight: number; configuredWeight?: number; rawOutcome?: string; observedAt?: string }
export interface TrustCategory { code: string; name: string; weight: number; score: number; contribution: number; signals: TrustSignal[] }
export interface TrustScore {
  subjectId: string; applicationId: string; sessionId?: string; finalScore: number; trustLevel: string; decision: string;
  reasons: string[]; evaluationId: string; configurationVersion: number; complete: boolean; mandatoryFailures: string[];
  categories: TrustCategory[]; calculatedAt: string;
}
export class TrustRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'TrustRequestError'
  }
}
export function trustToken(hostedUser = false) {
  if (hostedUser) return sessionStorage.getItem('identity_os_trust_user_token') || keycloak.token || ''
  const browser = keycloak.token || ''
  const hosted = localStorage.getItem('identity_os_hosted_admin_token') || ''
  const isAdmin = (token: string) => {
    const claims = trustClaims(token)
    return claims?.exp * 1000 > Date.now() && claims?.realm_access?.roles?.some((role: string) => ['PLATFORM_ADMIN', 'ORGANISATION_ADMIN', 'APPLICATION_SUPER_ADMIN'].includes(role))
  }
  return isAdmin(browser) ? browser : isAdmin(hosted) ? hosted : browser || hosted
}
export function trustClaims(token: string) {
  try { const value = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, '='))) } catch { return null }
}
export async function trustRequest<T>(path: string, options: RequestInit = {}, hostedUser = false): Promise<T> {
  if (!hostedUser && keycloak.authenticated) await keycloak.updateToken(30)
  const token = trustToken(hostedUser)
  if (!token) throw new TrustRequestError('Sign in to Identity OS to use trust management.', 401)
  const response = await fetch(`/api/catalogue${path}`, { ...options, cache: 'no-store', headers: {
    'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${token}`,
  } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new TrustRequestError(body.detail || body.message || `Trust request failed (${response.status}).`, response.status)
  return body as T
}
