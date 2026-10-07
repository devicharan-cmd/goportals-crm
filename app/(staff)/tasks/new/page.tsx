import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireStaff } from '@/lib/auth'
import { assignableFor, clientIdsForTeamLead, departmentIdsFor, getStaffLookups } from '@/lib/queries'
import { PageHeader } from '@/components/ui/primitives'
import { TaskForm } from '@/components/tasks/TaskForm'

export const metadata = { title: 'New task' }

export default async function NewTaskPage({ searchParams }: { searchParams: { client_id?: string; assignee?: string } }) {
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New task"
        back={<Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tasks</Link>}
      />
      <TaskForm
        mode="create"
        meId={me.id}
        defaultClientId={searchParams.client_id}
        defaultAssigneeId={searchParams.assignee}
        canMarkUrgent={me.role !== 'employee'}
        clients={clients}
        assignees={assignableFor(me, lookups).map(p => ({ id: p.id, name: p.full_name || p.email }))}
        departments={lookups.departments}
        platforms={lookups.platforms}
        services={lookups.services}
      />
    </div>
  )
}
