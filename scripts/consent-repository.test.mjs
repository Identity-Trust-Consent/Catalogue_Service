import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedConsentPath } from '../src/features/consent/proxy-policy.ts'

test('admin consent actions only expose the list and explicit mutation endpoints', () => {
  const id = '4b4c1111-1111-4111-8111-111111111111'
  assert.equal(allowedConsentPath(['admin-consents'], 'GET'), true)
  for (const action of ['update', 'revoke']) {
    assert.equal(allowedConsentPath(['admin-consents', id, action], 'POST'), true)
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal(allowedConsentPath(['admin-consents', id, action], method), false)
  }
  assert.equal(allowedConsentPath(['admin-consents'], 'POST'), false)
  assert.equal(allowedConsentPath(['admin-consents', 'invalid', 'revoke'], 'POST'), false)
})

test('repository proxy allows supported CRUD routes and read-only helper operations', () => {
  for (const resource of ['business-units', 'user-attributes', 'purposes-of-processing', 'consent-purposes', 'data-processors']) {
    for (const method of ['GET', 'POST']) assert.equal(allowedConsentPath(['repository', resource], method), true)
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal(allowedConsentPath(['repository', resource, '12'], method), true)
    assert.equal(allowedConsentPath(['repository', resource, 'check'], 'GET'), true)
    assert.equal(allowedConsentPath(['repository', resource, 'check'], 'POST'), false)
  }
  assert.equal(allowedConsentPath(['repository', 'consent-purposes', '12', 'affected-templates'], 'GET'), true)
  assert.equal(allowedConsentPath(['repository', 'consent-purposes', '12', 'affected-templates'], 'DELETE'), false)
})

test('repository proxy rejects arbitrary upstream paths, traversal and unsupported methods', () => {
  for (const path of [[], ['actuator', 'env'], ['repository', 'users'], ['repository', '..'], ['repository', 'business-units', '%2e%2e'], ['repository', 'business-units', '..'], ['repository', 'business-units', 'x/y'], ['repository', 'business-units', 'x\\y'], ['repository', 'business-units', '\u0000'], ['repository', 'business-units', '12', 'unexpected']]) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal(allowedConsentPath(path, method), false)
  }
  assert.equal(allowedConsentPath(['repository', 'business-units'], 'TRACE'), false)
  assert.equal(allowedConsentPath(['notice-templates', '12'], 'DELETE'), false)
  assert.equal(allowedConsentPath(['notice-templates', 'anything'], 'GET'), false)
})

test('notice and history routes permit authenticated read paths only', () => {
  const id = '7dc76936-f45b-4c17-99be-de4c82c0e198'
  for (const path of [['history'], ['notices'], ['records', 'options'], ['notices', id], ['notices', id, 'consents'], ['consents', id], ['consents', id, 'events']]) {
    assert.equal(allowedConsentPath(path, 'GET'), true)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(allowedConsentPath(path, method), false)
  }
  for (const path of [['history', id], ['records', 'env'], ['consents'], ['notices', '12'], ['consents', id, 'consents'], ['notices', id, 'events'], ['notices', id, 'consents', 'delete']]) assert.equal(allowedConsentPath(path, 'GET'), false)
})
