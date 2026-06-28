import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import KanbanBoard from '@/components/tickets/KanbanBoard'

export default async function TicketsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, is_admin').eq('user_id', user.id).single()
    : { data: null }
  const isAdmin = currentMember?.is_admin ?? false

  // Non-admins: get assigned client ids
  let assignedClientIds: string[] | null = null
  if (!isAdmin && currentMember) {
    const { data: assignments } = await supabase
      .from('client_assignments')
      .select('client_id')
      .eq('member_id', currentMember.id)
    assignedClientIds = (assignments ?? []).map((a: any) => a.client_id)
  }

  const SELECT = 'id, title, status, priority, platform, due_date, deadline_type, external_ref, clients(id, name), assignee:team_members!assignee_id(id, name)'

  // Fetch tickets — filter by assigned clients for non-admins
  let rawTickets: any[] = []
  if (!isAdmin && assignedClientIds !== null) {
    if (assignedClientIds.length > 0) {
      const { data } = await supabase
        .from('tickets')
        .select(SELECT)
        .in('client_id', assignedClientIds)
        .order('created_at', { ascending: false })
      rawTickets = data ?? []
    }
    // else: no assignments → empty board
  } else {
    const { data } = await supabase
      .from('tickets')
      .select(SELECT)
      .order('created_at', { ascending: false })
    rawTickets = data ?? []
  }

  // Clients for filter bar
  let clientsData: { id: string; name: string }[] = []
  if (!isAdmin && assignedClientIds !== null && assignedClientIds.length > 0) {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', assignedClientIds)
      .order('name')
    clientsData = data ?? []
  } else if (isAdmin) {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    clientsData = data ?? []
  }

  const { data: members } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const tickets = rawTickets as any[]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tickets.length} {isAdmin ? 'total' : 'assigned'} tickets</p>
        </div>
        <Link
          href="/tickets/new"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </Link>
      </div>
      <KanbanBoard tickets={tickets} clients={clientsData} members={members ?? []} />
    </div>
  )
}
