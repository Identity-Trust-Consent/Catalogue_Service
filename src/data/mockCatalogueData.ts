import type { ApplicationRecord, Organization, SchemaRecord } from '../types/catalogue'

export const initialPendingOrganizations: Organization[] = [
  {
    id: 'org_fs8b2c4e',
    name: 'Apex Digital',
    type: 'Company',
    country: 'India',
    email: 'admin@apexdigital.io',
    status: 'pending',
    registrationDetails: { registrationNumber: 'CIN123456', gst: '07ABCDE1234F1Z5' },
    representative: { name: 'Priya Shah', email: 'priya@apexdigital.io', mobile: '+91-9876543210', designation: 'Head Legal' },
    documents: [{ name: 'Certificate of Incorporation.pdf' }, { name: 'PAN.pdf' }],
    submittedAt: '05 Aug 2026, 03:53 pm',
  },
  {
    id: 'org_gv9d3a7f',
    name: 'Verity Health',
    type: 'Government',
    country: 'United States',
    email: 'admin@verityhealth.org',
    status: 'pending',
    registrationDetails: { registrationNumber: 'GH-998877', gst: '' },
    representative: { name: 'Mark Lewis', email: 'mark@verityhealth.org', mobile: '+1-555-234-5678', designation: 'Director' },
    documents: [{ name: 'Registration.pdf' }],
    submittedAt: '06 Aug 2026, 02:15 pm',
  },
]

export const approvedSeedOrganizations: Organization[] = [
  {
    id: 'org_7k3m9p2x',
    name: 'TechNova Solutions',
    type: 'Company',
    country: 'India',
    email: 'admin@technova.io',
    phone: '+91-8765432109',
    address: 'Embassy Tech Village, Outer Ring Road, Bengaluru, Karnataka - 560103',
    website: 'https://technova.io',
    registrationType: 'GST',
    registrationDetails: { registrationNumber: '27AADCT1234R1Z5', gst: '27AADCT1234R1Z5' },
    representative: { name: 'Aditya Kumar', email: 'aditya@technova.io', mobile: '+91-8765432109', designation: 'Organization Admin' },
    status: 'approved',
    orgAdminActivated: true,
  },
]

export const initialApplications: ApplicationRecord[] = [
  { id: 'app-101', orgId: 'org_7k3m9p2x', orgName: 'TechNova Solutions', name: 'Identity Suite', type: 'web', status: 'pending' },
  { id: 'app-102', orgId: 'org_fs8b2c4e', orgName: 'Apex Digital', name: 'Apex Access Portal', type: 'mobile', status: 'pending' },
]

export const initialSchemas: SchemaRecord[] = [
  { id: 'schema_001', type: 'registration', name: 'Employee Schema', orgId: 'org_7k3m9p2x', orgName: 'TechNova Solutions', fields: ['firstName', 'lastName', 'email', 'employeeId'], status: 'pending', createdAt: '2026-07-20, 10:32 am' },
  { id: 'schema_002', type: 'registration', name: 'Customer Profile', orgId: 'org_fs8b2c4e', orgName: 'Apex Digital', fields: ['name', 'email', 'phone', 'address'], status: 'pending', createdAt: '2026-08-05, 03:40 pm' },
]

export const approvedOrgIds = ['org_7k3m9p2x', 'org_b8c5d1k9', 'org_f9e2h4q7']

export const orgAdminMenu = [
  'Dashboard',
  'Registration Builder',
  'Login Configuration',
  'Consent Management',
  'All Users Details',
  'Trust Configuration',
  'Audit Logs',
  'Setting',
]
