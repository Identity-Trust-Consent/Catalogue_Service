import { NextRequest, NextResponse } from 'next/server'
import { allowedConsentPath } from '../../../../src/features/consent/proxy-policy'

type Context = { params: Promise<{ path: string[] }> }

async function proxy(request: NextRequest, context: Context) {
  const { path } = await context.params
  if (!allowedConsentPath(path, request.method)) return NextResponse.json({ detail: 'Unsupported consent route.' }, { status: 404 })
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ detail: 'Sign in to Identity OS to continue.' }, { status: 401 })
  const base = process.env.CONSENT_SERVICE_URL || 'http://localhost:8088'
  const target = new URL(`${base.replace(/\/$/, '')}/api/v1/consent/${path.map(encodeURIComponent).join('/')}`)
  target.search = request.nextUrl.search
  try {
    const upstream = await fetch(target, {
      method: request.method, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    })
    const headers: Record<string, string> = { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' }
    const location = upstream.headers.get('location')
    if (location?.startsWith('/api/v1/consent/')) headers.Location = location.replace('/api/v1/consent/', '/api/consent/')
    return new NextResponse(upstream.status === 204 ? null : await upstream.text(), { status: upstream.status, headers })
  } catch {
    return NextResponse.json({ detail: 'Consent Management Service is unavailable. Check its database and service configuration.' }, { status: 502 })
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
