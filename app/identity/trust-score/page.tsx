import HostedTrustScorePage from '../../../src/features/catalogue/pages/HostedTrustScorePage'

interface IdentityTrustScorePageProps {
  searchParams?: Promise<{ client_id?: string; username?: string }>
}

export default async function IdentityTrustScorePage({ searchParams }: IdentityTrustScorePageProps) {
  const params = await searchParams
  return <HostedTrustScorePage initialClientId={params?.client_id || ''} initialUsername={params?.username || ''} />
}
