import HostedCompleteProfilePage from '../../../src/features/catalogue/pages/HostedCompleteProfilePage'

interface IdentityCompleteProfilePageProps {
  searchParams?: Promise<{ client_id?: string; username?: string; return_url?: string }>
}

export default async function IdentityCompleteProfilePage({ searchParams }: IdentityCompleteProfilePageProps) {
  const params = await searchParams
  return (
    <HostedCompleteProfilePage
      initialClientId={params?.client_id || ''}
      initialUsername={params?.username || ''}
      initialReturnUrl={params?.return_url || ''}
    />
  )
}
