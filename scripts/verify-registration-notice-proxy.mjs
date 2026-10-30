// Production Next.js route test with an isolated local consent-service fixture.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const noticeId = 'a8fdd58f-51bf-4773-a2f5-34d03ef9cf99'
const token = 'a'.repeat(43)
const calls = []
const fixture = createServer(async (request, response) => {
  let text = ''
  for await (const chunk of request) text += chunk
  const body = JSON.parse(text)
  calls.push({ path: request.url, body, token: request.headers['x-notice-token'] })
  if (body.clientId === 'fixture_unauthorized') { response.writeHead(401); response.end(); return }
  if (body.clientId === 'fixture_html_error') { response.writeHead(500, { 'Content-Type': 'text/html' }); response.end('<h1>Internal error</h1>'); return }
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ id: noticeId, token, consentStatus: body.decision || null, template: { name: 'Registration' }, activities: [] }))
})
await new Promise(resolve => fixture.listen(58089, '127.0.0.1', resolve))
let logs = ''
const next = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'start', '--port', '53001', '--hostname', '127.0.0.1'], {
  cwd: root, windowsHide: true,
  env: { ...process.env, CONSENT_SERVICE_URL: 'http://127.0.0.1:58089', CONSENT_NOTICE_TEMPLATE_CODE: '2X67hx8xHO',
    CONSENT_PRIVACY_CONTACT_NAME: 'Fixture Privacy Team', CONSENT_PRIVACY_CONTACT_EMAIL: 'privacy@example.test',
    CONSENT_RIGHTS_URL: 'https://example.test/privacy/rights', CONSENT_WITHDRAWAL_URL: 'javascript:alert(1)' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
next.stdout.on('data', chunk => { logs += chunk })
next.stderr.on('data', chunk => { logs += chunk })
const url = 'http://127.0.0.1:53001/api/consent-notice'
const send = (method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
try {
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await fetch(url); ready = true; break } catch { await new Promise(resolve => setTimeout(resolve, 250)) }
    if (next.exitCode !== null) break
  }
  assert.ok(ready, `Next.js did not start: ${logs}`)
  let response = await send('POST', { clientId: 'app_test', dataPrincipalId: 'test@example.test', fields: { password: 'never-forward-this' }, templateCode: 'untrusted-override' })
  assert.equal(response.status, 200)
  const opened = await response.json()
  assert.equal(opened.id, noticeId)
  assert.equal(opened.privacy.contactEmail, 'privacy@example.test')
  assert.equal(opened.privacy.rightsUrl, 'https://example.test/privacy/rights')
  assert.equal(opened.privacy.withdrawalUrl, '')
  assert.deepEqual(calls[0], { path: '/api/v1/consent/registration-notices', body: { clientId: 'app_test', dataPrincipalId: 'test@example.test', templateCode: '2X67hx8xHO' }, token: undefined })
  response = await send('PUT', { noticeId, token, decision: 'accepted', selectedRuleIds: [12] })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).consentStatus, 'accepted')
  assert.deepEqual(calls[1], { path: `/api/v1/consent/registration-notices/${noticeId}/decision`, body: { decision: 'accepted', selectedRuleIds: [12] }, token })
  assert.equal((await send('PUT', { noticeId, decision: 'accepted', selectedRuleIds: [12] })).status, 400)
  assert.equal((await send('POST', {})).status, 400)
  assert.equal(calls.length, 2)
  response = await send('POST', { clientId: 'fixture_unauthorized', dataPrincipalId: 'test@example.test' })
  assert.equal(response.status, 502)
  assert.match((await response.json()).detail, /Restart consent-management-service/)
  response = await send('POST', { clientId: 'fixture_html_error', dataPrincipalId: 'test@example.test' })
  assert.equal(response.status, 502)
  assert.match((await response.json()).detail, /HTTP 500/)
  response = await send('POST', { clientId: 'app_test', dataPrincipalId: 'child@example.test', dateOfBirth: '2015-01-02', password: 'not-forwarded' })
  assert.equal(response.status, 200)
  assert.deepEqual(calls.at(-1).body, { clientId: 'app_test', dataPrincipalId: 'child@example.test', templateCode: '2X67hx8xHO', dateOfBirth: '2015-01-02' })
  const guardian = { name: 'Demo Parent', email: 'parent@example.test', mobile: '9876543210', dateOfBirth: '1980-01-02', relationship: 'parent', declaration: true, verificationMethod: 'phone', otp: '123456' }
  response = await send('PATCH', { noticeId, token, guardian: { ...guardian, password: 'not-forwarded', identityVerified: true } })
  assert.equal(response.status, 200)
  assert.deepEqual(calls.at(-1), { path: `/api/v1/consent/registration-notices/${noticeId}/guardian-verification`, token, body: guardian })
  const guardianReference = '99263035-2221-43e8-9b89-1f28557bc087'
  response = await send('PUT', { noticeId, token, decision: 'accepted', selectedRuleIds: [12], guardianReference })
  assert.equal(response.status, 200)
  assert.equal(calls.at(-1).body.guardianReference, guardianReference)
  const count = calls.length
  assert.equal((await send('PATCH', { noticeId, guardian })).status, 400)
  assert.equal((await send('POST', { clientId: 'app_test', dataPrincipalId: 'child@example.test', dateOfBirth: 'invalid' })).status, 400)
  assert.equal(calls.length, count)
  console.log('Registration notice proxy passed: native backend, configured template, token forwarding, private-field filtering and invalid-request rejection.')
} finally {
  if (next.exitCode === null) {
    const exited = once(next, 'exit')
    next.kill()
    await exited
  }
  await new Promise(resolve => fixture.close(resolve))
}
