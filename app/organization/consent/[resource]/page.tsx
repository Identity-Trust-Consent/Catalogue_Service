import { notFound } from 'next/navigation'
import DataRepositoryPage from '../../../../src/features/consent/DataRepositoryPage'
import { repositoryPages } from '../../../../src/features/consent/config'

export default async function Page({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params
  if (![...repositoryPages.map(page => page.key), 'data-processors'].includes(resource as any)) notFound()
  return <DataRepositoryPage resource={resource} />
}
