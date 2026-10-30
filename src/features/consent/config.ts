export const repositoryPages = [
  { key: 'business-units', title: 'Organizations', singular: 'Organization' },
  { key: 'user-attributes', title: 'Data Attributes', singular: 'Data Attribute' },
  { key: 'purposes-of-processing', title: 'Purpose Sub Master', singular: 'Purpose Sub Master' },
  { key: 'consent-purposes', title: 'Purpose Master', singular: 'Purpose Master' },
  { key: 'notice-templates', title: 'Notice Templates', singular: 'Notice Template' },
] as const
export type RepositoryResource = typeof repositoryPages[number]['key'] | 'data-processors'
export type ElementRecord = Record<string, any>
export const repositoryUrl = (resource: string) => `/organization/consent/${resource}`
export const apiPath = (resource: string) => resource === 'notice-templates' ? 'notice-templates' : `repository/${resource}`
export const languageNames: Record<string, string> = { en: 'English', as: 'Assamese', bn: 'Bengali', brx: 'Bodo', doi: 'Dogri', gu: 'Gujarati', hi: 'Hindi', kn: 'Kannada', ks: 'Kashmiri', kok: 'Konkani', mai: 'Maithili', ml: 'Malayalam', mni: 'Manipuri', mr: 'Marathi', ne: 'Nepali', or: 'Odia', pa: 'Punjabi', sa: 'Sanskrit', sat: 'Santali', sd: 'Sindhi', ta: 'Tamil', te: 'Telugu', ur: 'Urdu' }
