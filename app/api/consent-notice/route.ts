import { NextRequest, NextResponse } from 'next/server'
import { privacyDetails } from '../../../src/features/consent/notice-privacy'

const base = () => (process.env.CONSENT_SERVICE_URL || 'http://localhost:8088').replace(/\/$/, '')

async function forward(path: string, body: object, token?: string) {
  try {
    const response = await fetch(`${base()}/api/v1/consent/registration-notices${path}`, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { 'X-Notice-Token': token } : {}) },
      body: JSON.stringify(body),
    })
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ detail: 'The running Consent Management Service does not allow registration notices. Restart consent-management-service with the updated code, then try again.' }, { status: 502 })
    }
    const result = await response.json().catch(() => null)
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      const detail = response.status === 404
        ? 'The registration-notice endpoint is missing. Restart consent-management-service with the updated code.'
        : `Consent Management Service returned an empty or non-JSON response (HTTP ${response.status}). Check the backend logs.`
      return NextResponse.json({ detail }, { status: 502 })
    }
    return NextResponse.json(response.ok ? { ...result, privacy: privacyDetails() } : result, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ detail: 'Consent Management Service is unavailable. Please try opening the notice again.' }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.clientId !== 'string' || !body.clientId.trim() || typeof body.dataPrincipalId !== 'string' || !body.dataPrincipalId.trim()) {
    return NextResponse.json({ detail: 'An application and user identifier are required to open a notice.' }, { status: 400 })
  }
  const templateCode = process.env.CONSENT_NOTICE_TEMPLATE_CODE
  if (!templateCode) return NextResponse.json({ detail: 'Set CONSENT_NOTICE_TEMPLATE_CODE to the published registration notice template code.' }, { status: 503 })
  if (body.dateOfBirth !== undefined && (typeof body.dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth))) {
    return NextResponse.json({ detail: 'Enter a valid date of birth before opening the notice.' }, { status: 400 })
  }
  return forward('', { clientId: body.clientId, dataPrincipalId: body.dataPrincipalId, templateCode, ...(body.dateOfBirth ? { dateOfBirth: body.dateOfBirth } : {}) })
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.noticeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.noticeId)
      || typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)
      || !['accepted', 'rejected'].includes(body.decision) || !Array.isArray(body.selectedRuleIds)
      || body.selectedRuleIds.length > 1000 || body.selectedRuleIds.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0)) {
    return NextResponse.json({ detail: 'A valid notice, token and consent decision are required.' }, { status: 400 })
  }
  return forward(`/${body.noticeId}/decision`, { decision: body.decision, selectedRuleIds: body.selectedRuleIds, ...(typeof body.guardianReference === 'string' ? { guardianReference: body.guardianReference } : {}) }, body.token)
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.noticeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.noticeId)
      || typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token) || !body.guardian || typeof body.guardian !== 'object') {
    return NextResponse.json({ detail: 'A valid notice, token and guardian details are required.' }, { status: 400 })
  }
  const { name, email, mobile, dateOfBirth, relationship, declaration, verificationMethod, aadhaar, otp } = body.guardian
  return forward(`/${body.noticeId}/guardian-verification`, { name, email, ...(verificationMethod === 'phone' ? { mobile } : {}), dateOfBirth, relationship, declaration: declaration === true, verificationMethod, ...(verificationMethod === 'aadhaar' ? { aadhaar } : {}), otp }, body.token)
}
