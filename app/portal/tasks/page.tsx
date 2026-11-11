import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { PortalTaskList } from '@/components/portal/PortalTaskList'
import { getPortalNames } from '@/lib/portal'
import { ROLE_LABELS } from '@/lib/constants'
import type { AssigneeOption, TaskAssignerInfo } from '@/lib/queries'
import type { StaffDirectoryEntry, TaskSummary } from '@/types/database'

export const metadata = { title: 'Tasks' }

export default async function PortalTasksPage() {
  const me = await requireClient()
  const supabase = await createClient()
  const [result, names, directoryResult] = await Promise.all([
    supabase.rpc('client_ticket_tasks', { p_task_id: null, p_task_number: null }),
    getPortalNames(me),
    supabase.rpc('staff_directory'),
  ])
  const { data, error } = result
  if (error) throw new Error(error.message)
  if (directoryResult.error) throw new Error(directoryResult.error.message)

  const tasks = (data ?? []) as TaskSummary[]
  const directory = (directoryResult.data ?? []) as StaffDirectoryEntry[]
  const people: AssigneeOption[] = [
    ...directory.map(person => ({
      id: person.id,
      name: names[person.id] ?? person.full_name ?? 'GoPortals team',
      avatarUrl: person.avatar_url,
      role: ROLE_LABELS[person.role],
      avatarRole: person.role,
    })),
    {
      id: me.id,
      name: names[me.id] ?? me.full_name ?? me.email,
      avatarRole: 'client',
    },
  ]
  const taskAssigners: Record<string, TaskAssignerInfo> = Object.fromEntries(directory.map(person => [
    person.id,
    { name: names[person.id] ?? person.full_name ?? 'GoPortals team', role: person.role, avatarUrl: person.avatar_url },
  ]))

  return (
    <PortalTaskList
      tasks={tasks}
      names={names}
      meId={me.id}
      people={people}
      taskAssigners={taskAssigners}
    />
  )
}
