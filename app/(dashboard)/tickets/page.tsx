import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import KanbanBoard from '@/components/tickets/KanbanBoard'

function getDeadlineLevel(dueDateStr: string | null): 'overdue' | 'today' | 'soon' | 'ok' | 'none' {
  if (!dueDateStr) return 'none'
  const days = Math.round(
    (new Date(dueDateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 864e5
  )
  if (days < 0)   return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3)  return 'soon'
  return 'ok'
}

const deadlineBorderColor: Record<string, string> = {
  overdue: 'border-l-red-500',
  today:   'border-l-red-400',
  soon:    'border-l-amber-400',
  ok:      'border-l-green-400',
  none:    'border-l-gray-200',
}

const deadlineTopBar: Record<string, string> = {
  overdue: 'bg-red-500',
  today:   'bg-red-400',
  soon:    'bg-amber-400',
  ok:      'bg-green-400',
  none:    'bg-gray-100',
}

const deadlineBadge: Record<string, string> = {
  overdue: 'bg-red-100 text-red-700',
  today:   'bg-red-100 text-red-700',
  soon:    'bg-amber-100 text-amber-700',
  ok:      'bg-green-100 text-green-700',
  none:    'bg-gray-100 text-gray-500',
}

function deadlineLabel(dueDateStr: string | null): string {
  if (!dueDateStr) return 'No deadline'
  const days = Math.round(
    (new Date(dueDateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 864e5
  )
  if (days < 0)   return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  return `${days}d left`
}

export default async function TicketsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, is_admin').eq('user_id', user.id).single()
    : { data: null }
  const isAdmin = currentMember?.is_admin ?? false

  let assignedClientIds: string[] | null = null
  if (!isAdmin && currentMember) {
    const { data: assignments } = await supabase
      .from('client_assignments')
      .select('client_id')
      .eq('member_id', currentMember.id)
    assignedClientIds = (assignments ?? []).map((a: any) => a.client_id)
  }

  // SELECT — use created_at as fallback for assigned_date, reporter_id as fallback for assigned_by
  const SELECT = [
    'id, title, status, priority, platform, due_date, deadline_type,',
    'external_ref, created_at, updated_at,',
    'assigned_date, assigned_by,',
    'clients(id, name),',
    'assignee:team_members!assignee_id(id, name),',
    'reporter:team_members!reporter_id(id, name)',
  ].join(' ')

  let rawTickets: any[] = []
  if (!isAdmin && assignedClientIds !== null) {
    if (assignedClientIds.length > 0) {
      const { data } = await supabase
        .from('tickets')
        .select(SELECT)
        .in('client_id', assignedClientIds)
        .order('due_date', { ascending: true, nullsFirst: false })
      rawTickets = data ?? []
    }
  } else {
    const { data } = await supabase
      .from('tickets')
      .select(SELECT)
      .order('due_date', { ascending: true, nullsFirst: false })
    rawTickets = data ?? []
  }

  let clientsData: { id: string; name: string }[] = []
  if (!isAdmin && assignedClientIds !== null && assignedClientIds.length > 0) {
    const { data } = await supabase.from('clients').select('id, name').in('id', assignedClientIds).order('name')
    clientsData = data ?? []
  } else if (isAdmin) {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    clientsData = data ?? []
  }

  const { data: members } = await supabase
    .from('team_members').select('id, name').eq('is_active', true).order('name')

  const tickets = rawTickets as any[]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tickets.length} {isAdmin ? 'total' : 'assigned'} tickets
          </p>
        </div>
        <Link
          href="/tickets/new"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </Link>
      </div>

      {/* Deadline legend */}
      <div className="flex items-center gap-5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" />Due today / overdue</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-400" />Within 3 days</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-400" />On track</span>
      </div>

      {/* List view with full metadata */}
      <div className="space-y-2">
        {tickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
            No tickets yet —{' '}
            <Link href="/tickets/new" className="text-blue-600 hover:underline">create the first one</Link>
          </div>
        ) : (
          tickets.map((ticket: any) => {
            const level = getDeadlineLevel(ticket.due_date)
            // Use assigned_date if exists, fallback to created_at
            const assignedDate = ticket.assigned_date ?? ticket.created_at
            // Use assigned_by if exists, fallback to reporter
            const assignedByName = ticket.assigned_by
              ? null // will be resolved if we add the join later
              : (ticket.reporter as any)?.name ?? '—'

            const totalDays = assignedDate && ticket.due_date
              ? Math.round((new Date(ticket.due_date).getTime() - new Date(assignedDate).getTime()) / 864e5)
              : null
            const elapsedDays = assignedDate
              ? Math.round((new Date().getTime() - new Date(assignedDate).getTime()) / 864e5)
              : null

            return (
              <div
                key={ticket.id}
                className={`bg-white rounded-xl border border-gray-200 border-l-4 overflow-hidden ${deadlineBorderColor[level]}`}
              >
                {/* Colour top bar */}
                <div className={`h-1 w-full ${deadlineTopBar[level]}`} />

                {/* Title row */}
                <div className="flex items-start gap-3 px-4 pt-3 pb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{ticket.title}</p>
                    {ticket.external_ref && (
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">Ref: {ticket.external_ref}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
                      ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
                      ticket.priority === 'P3' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{ticket.priority}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${deadlineBadge[level]}`}>
                      {deadlineLabel(ticket.due_date)}
                    </span>
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-4 border-t border-gray-100 divide-x divide-gray-100">
                  <div className="px-4 py-2.5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Assigned by</p>
                    <p className="text-xs font-medium text-gray-800">{assignedByName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {assignedDate
                        ? new Date(assignedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>

                  <div className="px-4 py-2.5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Assigned to</p>
                    <div className="flex items-center gap-1.5">
                      {(ticket.assignee as any)?.name && (
                        <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {(ticket.assignee as any).name.charAt(0)}
                        </div>
                      )}
                      <p className="text-xs font-medium text-gray-800">
                        {(ticket.assignee as any)?.name ?? 'Unassigned'}
                      </p>
                    </div>
                    {ticket.platform && (
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{ticket.platform}</p>
                    )}
                  </div>

                  <div className="px-4 py-2.5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Deadline</p>
                    <p className={`text-xs font-medium ${
                      level === 'overdue' || level === 'today' ? 'text-red-600' :
                      level === 'soon' ? 'text-amber-600' : 'text-gray-800'
                    }`}>
                      {ticket.due_date
                        ? new Date(ticket.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'No deadline'}
                    </p>
                    {totalDays !== null && elapsedDays !== null && (
                      <p className="text-xs text-gray-400 mt-0.5">Day {Math.max(elapsedDays, 0)} of {totalDays}</p>
                    )}
                  </div>

                  <div className="px-4 py-2.5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Client</p>
                    <p className="text-xs font-medium text-gray-800">
                      {(ticket.clients as any)?.name ?? '—'}
                    </p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                      ticket.status === 'done'              ? 'bg-green-100 text-green-700' :
                      ticket.status === 'in_progress'       ? 'bg-blue-100 text-blue-700' :
                      ticket.status === 'blocked'           ? 'bg-red-100 text-red-700' :
                      ticket.status === 'in_review'         ? 'bg-purple-100 text-purple-700' :
                      ticket.status === 'waiting_on_client' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {ticket.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Kanban board below */}
      {tickets.length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Kanban view</h2>
          <KanbanBoard tickets={tickets} clients={clientsData} members={members ?? []} />
        </div>
      )}
    </div>
  )
}
