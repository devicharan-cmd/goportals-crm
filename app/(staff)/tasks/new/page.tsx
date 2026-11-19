import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireStaff } from '@/lib/auth'
import { assignableFor, getStaffLookups, taskAssigneeOptionsFor } from '@/lib/queries'
import { ROLE_LABELS } from '@/lib/constants'
import { TaskForm } from '@/components/tasks/TaskForm'

export const metadata = { title: 'Create New Task' }

export default async function NewTaskPage(
  props: { searchParams: Promise<{ client_id?: string; assignee?: string }> }
) {
  const searchParams = await props.searchParams
  const me = await requireStaff()
  // The profiles query already returns staff visible to staff RLS; this form
  // does not need the separate public staff-directory RPC as well.
  const lookups = await getStaffLookups({ includeDirectory: false })

  const clients = lookups.clients

  const clientAssignees = taskAssigneeOptionsFor(me, lookups)
    .filter(option => option.clientId && clients.some(client => client.id === option.clientId))

  return (
    <div>
      <div className="mb-4">
        <Link href="/tasks" prefetch={false} className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tasks</Link>
      </div>
      <TaskForm
        mode="create"
        meId={me.id}
        defaultClientId={searchParams.client_id}
        defaultAssigneeId={searchParams.assignee}
        canMarkUrgent={me.role !== 'employee'}
        clients={clients}
        assignees={assignableFor(me, lookups).map(p => ({ id: p.id, name: p.full_name || p.email, avatarUrl: p.avatar_url, employeeId: p.id, role: ROLE_LABELS[p.role], avatarRole: p.role }))}
        clientAssignees={clientAssignees}
        departments={lookups.departments}
        platforms={lookups.platforms}
        services={lookups.services}
      />
    </div>
  )
}
