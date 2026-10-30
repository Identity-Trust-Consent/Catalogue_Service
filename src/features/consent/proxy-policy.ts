const resources = new Set(['business-units', 'user-attributes', 'purposes-of-processing', 'consent-purposes', 'data-processors'])
export function allowedConsentPath(path: string[], method: string) {
  if (!path.length || path.some(segment => !segment || segment === '.' || segment === '..' || /[\\/%\x00-\x1f]/.test(segment))) return false
  if (path[0] === 'admin-consents') {
    if (path.length === 1) return method === 'GET'
    return path.length === 3 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1]) && ['revoke', 'update'].includes(path[2]) && method === 'POST'
  }
  if (['history', 'notices', 'consents', 'records'].includes(path[0])) {
    if (method !== 'GET') return false
    if (path[0] === 'records') return path.length === 2 && path[1] === 'options'
    if (path[0] === 'history') return path.length === 1
    if (path[0] === 'notices' && path.length === 1) return true
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1] || '')) return false
    return path.length === 2 || path.length === 3 && path[2] === (path[0] === 'notices' ? 'consents' : 'events')
  }
  if (path[0] === 'notice-templates') return path.length === 1 ? ['GET', 'POST'].includes(method) : path.length === 2 && /^\d+$/.test(path[1]) && method === 'GET'
  if (path[0] !== 'repository' || !resources.has(path[1])) return false
  if (path.length === 2) return ['GET', 'POST'].includes(method)
  if (path.length === 3) return ['check', 'latest-version'].includes(path[2]) ? method === 'GET' : ['GET', 'PUT', 'DELETE'].includes(method)
  return path.length === 4 && path[1] === 'consent-purposes' && /^\d+$/.test(path[2]) && path[3] === 'affected-templates' && method === 'GET'
}
