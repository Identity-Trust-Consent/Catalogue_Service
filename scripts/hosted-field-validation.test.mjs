import test from 'node:test'
import assert from 'node:assert/strict'
import { hostedFieldError, hostedFieldKind, isMinorBirthDate, pendingHostedVerifications } from '../src/features/catalogue/pages/hosted-field-validation.ts'

const field = (name, type = 'text', required = true) => ({ name, type, required })

test('child age gate handles eighteenth birthday and leap-year anniversaries', () => {
  assert.equal(isMinorBirthDate('2008-10-30', '2026-10-29'), true)
  assert.equal(isMinorBirthDate('2008-10-29', '2026-10-29'), false)
  assert.equal(isMinorBirthDate('2008-10-28', '2026-10-29'), false)
  assert.equal(isMinorBirthDate('2008-02-29', '2026-02-27'), true)
  assert.equal(isMinorBirthDate('2008-02-29', '2026-02-28'), false)
})

test('registration remains blocked by unsubmitted OTPs after consent', () => {
  const fields = [field('aadhaar'), field('phone')]
  const values = { aadhaar: '012345678901', phone: '9876543210' }
  const states = { phone: { sent: true, otp: '123456', value: values.phone, verified: false } }
  assert.deepEqual(pendingHostedVerifications(fields, values, states).map(field => field.name), ['aadhaar', 'phone'])
  states.phone.verified = true
  assert.deepEqual(pendingHostedVerifications(fields, values, states).map(field => field.name), ['aadhaar'])
  states.aadhaar = { value: values.aadhaar, verified: true }
  assert.deepEqual(pendingHostedVerifications(fields, values, states), [])
})

test('changing a verified value requires verification again; empty optional values do not block', () => {
  const fields = [field('phone'), field('email', 'email', false)]
  assert.deepEqual(pendingHostedVerifications(fields, { phone: '9876543210', email: '' }, {
    phone: { value: '9876543211', verified: true },
  }).map(field => field.name), ['phone'])
  assert.deepEqual(pendingHostedVerifications([], {}, {}), [])
})

test('recognizes configured field names even when their type is text', () => {
  for (const name of ['aadhar', 'aadhaar', 'aadhaar_number', 'aadharNo']) assert.equal(hostedFieldKind(field(name)), 'aadhaar')
  for (const name of ['mobile no', 'phone_number', 'mobileNumber']) assert.equal(hostedFieldKind(field(name)), 'mobile')
  for (const name of ['DOB', 'date_of_birth']) assert.equal(hostedFieldKind(field(name)), 'date')
  assert.equal(hostedFieldKind({ name: 'custom_1', label: 'Email', type: 'text' }), 'email')
  assert.equal(hostedFieldKind(field('password')), 'password')
})

test('validates email syntax and exact digit counts without accepting letters or spaces', () => {
  for (const [name, valid, invalid] of [
    ['email', 'person@example.com', ['person', 'person@', 'person@example', 'person @example.com']],
    ['aadhaar', '012345678901', ['12345678901', '1234567890123', '12345678901a', '1234 5678 9012']],
    ['mobile', '9876543210', ['987654321', '98765432101', '+919876543210', '98765abcde']],
  ]) {
    assert.equal(hostedFieldError(field(name), valid), '')
    for (const value of invalid) assert.notEqual(hostedFieldError(field(name), value), '')
    assert.notEqual(hostedFieldError(field(name), ''), '')
    assert.equal(hostedFieldError(field(name, 'text', false), ''), '')
  }
})

test('DOB rejects impossible dates and future dates', () => {
  assert.equal(hostedFieldError(field('dob'), '2000-02-29'), '')
  for (const date of ['2001-02-29', '2000-13-01', 'not-a-date', '2999-01-01']) assert.notEqual(hostedFieldError(field('dob'), date), '')
})
