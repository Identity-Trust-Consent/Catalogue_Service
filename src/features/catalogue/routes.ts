export const catalogueRoutes = {
  home: '/',
  registration: '/register',
  success: '/registration/success',
  platform: '/platform',
  'platform-dashboard': '/platform/dashboard',
  'platform-organizations': '/platform/organizations',
  'platform-approved': '/platform/organizations',
  'platform-apps': '/platform/applications',
  'platform-schema': '/platform/schemas',
  'platform-pending': '/platform/pending',
  'platform-audit': '/platform/audit',
  'platform-identity-mgmt': '/platform/identity-management',
  'platform-auth-monitor': '/platform/auth-monitoring',
  'platform-security-monitor': '/platform/security-monitoring',
  'platform-api': '/platform/api-management',
  'platform-trust': '/platform/trust-management',
  'platform-reports': '/platform/reports',
  'platform-notifications': '/platform/notifications',
  'platform-settings': '/platform/organizations',
  organization: '/organization',
  'organization-dashboard': '/organization/dashboard',
  'org-profile': '/organization/profile',
  'org-applications': '/organization/applications',
  'org-users': '/organization/users',
  'org-audit-logs': '/organization/audit-logs',
  'org-registration-builder': '/organization/registration-builder',
  'org-login-builder': '/organization/login-builder',
} as const

export type CatalogueView = keyof typeof catalogueRoutes

export const getCatalogueRoute = (view: string) =>
  catalogueRoutes[view as CatalogueView] || catalogueRoutes.home
