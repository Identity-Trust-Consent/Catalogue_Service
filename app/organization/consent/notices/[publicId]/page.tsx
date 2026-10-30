import { notFound } from 'next/navigation'
import ConsentRecordsPage from '../../../../../src/features/consent/ConsentRecordsPage'

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId)) notFound()
  return <ConsentRecordsPage mode="notices" publicId={publicId} />
}
