import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CLIENT_PAGE_SIZE } from '@/lib/constants'
import { Card } from '@/components/ui/primitives'
import { ClientFormModal } from '@/components/clients/ClientFormModal'
import { ClientSearchField, ClientSearchProvider, ClientSearchResults, ClientStatusFilter } from '@/components/clients/ClientSearchList'
import { nameMap } from '@/lib/queries'
import type { Client, Platform, Service } from '@/types/database'

export const metadata = { title: 'Clients' }

type Row = Client & {
  client_team: { profile_id: string }[]
}

export default async function ClientsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams
  const me = await requireRole(['super_admin', 'manager'])
  const supabase = await createClient()

  const status = searchParams.status === 'active' || searchParams.status === 'pending'
    || searchParams.status === 'suspended' || searchParams.status === 'rejected'
    ? searchParams.status
    : ''
  let query = supabase.from('clients')
    .select('*, client_team(profile_id)')
    .order('company_name')
    .order('id')
    .range(0, CLIENT_PAGE_SIZE)
  if (status) query = query.eq('status', status)

  const [
    { data, error: clientsError },
    { data: workCounts, error: workCountsError },
    { data: people, error: peopleError },
    { data: platforms, error: platformsError },
    { data: services, error: servicesError },
  ] = await Promise.all([
    query,
    supabase.rpc('client_open_work_counts'),
    supabase.from('profiles').select('id, full_name, email, avatar_url'),
    supabase.from('platforms').select('*').order('sort_order'),
    supabase.from('services').select('*').order('sort_order'),
  ])
  for (const error of [clientsError, workCountsError, peopleError, platformsError, servicesError]) {
    if (error) throw error
  }
  const hasMoreClients = (data?.length ?? 0) > CLIENT_PAGE_SIZE
  const clients = (data ?? []).slice(0, CLIENT_PAGE_SIZE) as Row[]
  const imagePaths = clients.filter(c => c.company_profile_image_path).map(c => c.company_profile_image_path!)
  const { data: signedImages, error: imageError } = imagePaths.length
    ? await supabase.storage.from('client-profile-images').createSignedUrls(imagePaths, 3600)
    : { data: [], error: null }
  if (imageError) throw imageError
  const imageUrlByPath = Object.fromEntries((signedImages ?? []).map(image => [image.path, image.signedUrl]))
  const names = nameMap(people ?? [])
  const avatarUrls = Object.fromEntries((people ?? []).map(person => [person.id, person.avatar_url]))
  const openCount = Object.fromEntries((workCounts ?? []).map((row: {
    client_id: string
    open_task_count: number
    open_ticket_count: number
  }) => [row.client_id, Number(row.open_task_count) + Number(row.open_ticket_count)]))

  return (
    <ClientSearchProvider
      initialClients={clients}
      initialHasMoreClients={hasMoreClients}
      initialClientOffset={CLIENT_PAGE_SIZE}
      initialImageUrlByPath={imageUrlByPath}
      names={names}
      avatarUrls={avatarUrls}
      status={status}
      openCount={openCount}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ClientSearchField />
        <ClientStatusFilter status={status} />
        {/* Outside the search form: the modal has its own form inside. */}
        {['super_admin', 'manager'].includes(me.role) && <ClientFormModal canEditInternal platforms={(platforms ?? []) as Platform[]} services={(services ?? []) as Service[]} />}
      </div>

      <Card className="overflow-hidden">
        <ClientSearchResults />
      </Card>
    </ClientSearchProvider>
  )
}
