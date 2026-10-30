type Field = { name: string; label?: string; type: string; required?: boolean }

export const pendingHostedVerifications = <T extends Field>(
  fields: T[],
  values: Record<string, string>,
  states: Record<string, { verified?: boolean; value?: string }>,
) => fields.filter(field => {
  const value = String(values[field.name] || '')
  return Boolean(value.trim()) && (!states[field.name]?.verified || states[field.name]?.value !== value)
})

export const hostedFieldKind = (field: Field) => {
  const tokens = [field.name, field.label || ''].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d+$/, ''))
  if (field.type === 'password' || tokens.includes('password')) return 'password'
  if (field.type === 'email' || tokens.some(token => ['email', 'emailaddress'].includes(token))) return 'email'
  if (tokens.some(token => ['aadhaar', 'aadhar', 'aadhaarnumber', 'aadharnumber', 'aadhaarno', 'aadharno'].includes(token))) return 'aadhaar'
  if (['phone', 'tel'].includes(field.type) || tokens.some(token => ['phone', 'phonenumber', 'phoneno', 'mobile', 'mobilenumber', 'mobileno'].includes(token))) return 'mobile'
  if (field.type === 'date' || tokens.some(token => ['dob', 'dateofbirth', 'birthdate'].includes(token))) return 'date'
  return 'text'
}

export const localDateToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const isMinorBirthDate = (birth: string, today = localDateToday()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return false
  const [year, month, day] = birth.split('-').map(Number)
  const adultYear = year + 18
  const anniversaryDay = Math.min(day, new Date(adultYear, month, 0).getDate())
  return `${adultYear}-${String(month).padStart(2, '0')}-${String(anniversaryDay).padStart(2, '0')}` > today
}

export const hostedFieldError = (field: Field, value: string) => {
  if (!value.trim()) return field.required ? `${field.label || field.name} is required.` : ''
  switch (hostedFieldKind(field)) {
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Enter a valid email address.'
    case 'aadhaar': return /^\d{12}$/.test(value) ? '' : 'Aadhaar must contain exactly 12 digits.'
    case 'mobile': return /^\d{10}$/.test(value) ? '' : 'Mobile number must contain exactly 10 digits.'
    case 'date': {
      const date = new Date(`${value}T00:00:00`)
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime())
        && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === value
      return valid && value <= localDateToday() ? '' : 'Enter a valid date of birth that is not in the future.'
    }
    default: return ''
  }
}
