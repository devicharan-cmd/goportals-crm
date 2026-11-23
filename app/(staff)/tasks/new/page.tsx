import { requireStaff } from '@/lib/auth'
import { assignableFor, getStaffLookups, taskAssigneeOptionsFor } from '@/lib/queries'
import { ROLE_LABELS } from '@/lib/constants'
import { TaskForm } from '@/components/tasks/TaskForm'
import { TaskBackLink } from '@/components/tasks/TaskBackLink'

export const metadata = { title: 'Create New Task' }

export default async function NewTaskPage(
  props: { searchParams: Promise<{ client_id?: string; assignee?: string }> }
) {
  const searchParams = await props.searchParams
  // The profiles query already returns staff visible to staff RLS; this form
  // does not need the separate public staff-directory RPC as well.
  // Fetch independent lookups alongside the access check so the initial form
  // render does not wait an extra server round trip.
  const [me, lookups] = await Promise.all([
    requireStaff(),
    getStaffLookups({ includeDirectory: false }),
  ])

  const clients = lookups.clients

  const clientAssignees = taskAssigneeOptionsFor(me, lookups)
    .filter(option => option.clientId && clients.some(client => client.id === option.clientId))

  return (
    <div>
      <div className="mb-4">
        <TaskBackLink />
      </div>
      <TaskForm
        mode="create"
        meId={me.id}
        defaultClientId={searchParams.client_id}
        defaultAssigneeId={searchParams.assignee}
        canMarkUrgent
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
