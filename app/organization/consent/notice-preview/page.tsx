import NoticePreviewPage from '../../../../src/features/consent/NoticePreviewPage'
import { privacyDetails } from '../../../../src/features/consent/notice-privacy'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <NoticePreviewPage privacy={privacyDetails()} configuredCode={process.env.CONSENT_NOTICE_TEMPLATE_CODE || ''} />
}
