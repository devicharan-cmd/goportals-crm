import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Card } from '@/components/ui/primitives'
import { ClientFormModal } from '@/components/clients/ClientFormModal'
import { ClientSearchField, ClientSearchProvider, ClientSearchResults } from '@/components/clients/ClientSearchList'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { nameMap } from '@/lib/queries'
import type { Client, Platform, Service } from '@/types/database'

export const metadata = { title: 'Clients' }

type Row = Client & {
  client_team: { profile_id: string }[]
}

export default async function ClientsPage({ searchParams }: { searchParams: { status?: string } }) {
  const me = await requireRole(['super_admin', 'admin'])
  const supabase = createClient()

  let query = supabase.from('clients')
    .select('*, client_team(profile_id)')
    .order('company_name')
  if (searchParams.status) query = query.eq('status', searchParams.status)

  const [{ data }, { data: openTasks }, { data: openTickets }, { data: people }, { data: platforms }, { data: services }] = await Promise.all([
    query,
    supabase.from('tasks').select('client_id').not('status', 'in', '(completed,cancelled)'),
    supabase.from('tickets').select('client_id').neq('status', 'closed'),
    supabase.from('profiles').select('id, full_name, email, avatar_url'),
    supabase.from('platforms').select('*').order('sort_order'),
    supabase.from('services').select('*').order('sort_order'),
  ])
  const clients = (data ?? []) as Row[]
  const imagePaths = clients.filter(c => c.company_profile_image_path).map(c => c.company_profile_image_path!)
  const { data: signedImages } = imagePaths.length
    ? await supabase.storage.from('client-profile-images').createSignedUrls(imagePaths, 3600)
    : { data: [] }
  const imageUrlByPath = Object.fromEntries((signedImages ?? []).map(image => [image.path, image.signedUrl]))
  const names = nameMap(people ?? [])
  const avatarUrls = Object.fromEntries((people ?? []).map(person => [person.id, person.avatar_url]))
  // Open work means both: a client raising tickets but having no tasks yet
  // used to read as "0 open".
  const openCount = [...(openTasks ?? []), ...(openTickets ?? [])]
    .reduce<Record<string, number>>((acc, row: { client_id: string }) => {
      acc[row.client_id] = (acc[row.client_id] ?? 0) + 1
      return acc
    }, {})

  return (
    <ClientSearchProvider
      initialClients={clients}
      initialImageUrlByPath={imageUrlByPath}
      names={names}
      avatarUrls={avatarUrls}
      status={searchParams.status === 'active' || searchParams.status === 'pending' || searchParams.status === 'suspended' || searchParams.status === 'rejected' ? searchParams.status : ''}
      openCount={openCount}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ClientSearchField />
        <form className="flex flex-wrap gap-2" action="/clients">
          <SearchableSelect name="status" defaultValue={searchParams.status ?? ''} className="input h-9 w-auto py-1.5" aria-label="Client status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </SearchableSelect>
          <button className="rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200">Filter</button>
        </form>
        {/* Outside the search form: the modal has its own form inside. */}
        {['super_admin', 'admin'].includes(me.role) && <ClientFormModal canEditInternal platforms={(platforms ?? []) as Platform[]} services={(services ?? []) as Service[]} />}
      </div>

      <Card className="overflow-hidden">
        <ClientSearchResults />
      </Card>
    </ClientSearchProvider>
  )
}
