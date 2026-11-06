import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { assignableFor, clientIdsForTeamLead, departmentIdsFor, getStaffLookups } from '@/lib/queries'
import { ROLE_LABELS } from '@/lib/constants'
import { TaskForm } from '@/components/tasks/TaskForm'

export const metadata = { title: 'Create New Task' }

export default async function NewTaskPage(
  props: { searchParams: Promise<{ client_id?: string; assignee?: string }> }
) {
  const searchParams = await props.searchParams
  const me = await requireStaff()
  const lookups = await getStaffLookups()

  // Team leads only see clients they cover via client_team (personally, or
  // through their department) — /clients itself is admin/super_admin only, so
  // the full company-wide list here would otherwise leak every client's name to them.
  let clients = lookups.clients
  if (me.role === 'team_lead') {
    const deptIds = Array.from(departmentIdsFor(me.id, lookups))
    const clientIds = await clientIdsForTeamLead(me.id, deptIds)
    clients = lookups.clients.filter(c => clientIds.has(c.id))
  }

  const { data: activeTickets, error: ticketsError } = clients.length > 0
    ? await createClient().from('tickets').select('client_id').in('client_id', clients.map(client => client.id)).neq('status', 'closed')
    : { data: [], error: null }
  if (ticketsError) throw ticketsError
  const clientsWithActiveTickets = new Set((activeTickets ?? []).map(ticket => ticket.client_id))
  clients = clients.filter(client => clientsWithActiveTickets.has(client.id))

  return (
    <div>
      <div className="mb-4">
        <Link href="/tasks" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tasks</Link>
      </div>
      <TaskForm
        mode="create"
        meId={me.id}
        defaultClientId={searchParams.client_id}
        defaultAssigneeId={searchParams.assignee}
        canMarkUrgent={me.role !== 'employee'}
        clients={clients}
        assignees={assignableFor(me, lookups).map(p => ({ id: p.id, name: p.full_name || p.email, avatarUrl: p.avatar_url, employeeId: p.id, role: ROLE_LABELS[p.role], avatarRole: p.role }))}
        departments={lookups.departments}
        platforms={lookups.platforms}
        services={lookups.services}
      />
    </div>
  )
}
