/** Server-side public contact configuration shared by live notices and previews. */
export function privacyDetails() {
  const webLink = (value?: string) => {
    try {
      const url = new URL(value || '')
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : ''
    } catch { return '' }
  }
  const email = process.env.CONSENT_PRIVACY_CONTACT_EMAIL || ''
  return {
    contactName: process.env.CONSENT_PRIVACY_CONTACT_NAME || '',
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    policyUrl: webLink(process.env.CONSENT_PRIVACY_POLICY_URL),
    withdrawalUrl: webLink(process.env.CONSENT_WITHDRAWAL_URL),
    rightsUrl: webLink(process.env.CONSENT_RIGHTS_URL),
    grievanceUrl: webLink(process.env.CONSENT_GRIEVANCE_URL),
    boardComplaintUrl: webLink(process.env.CONSENT_BOARD_COMPLAINT_URL),
  }
}
