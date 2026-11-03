import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assignableFor, assigneeOptionsFor, getTaskPageLookups, nameMap, TASK_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { TaskFilters } from '@/components/tasks/TaskFilters'
import { TaskSearchProvider, TaskSearchResults } from '@/components/tasks/TaskSearch'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'Tasks' }

type SP = { view?: string; scope?: string; status?: string; client?: string; assignee?: string; dept?: string }

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const me = await requireStaff()
  const supabase = createClient()

  // RLS limits each role to the tasks they are allowed to see.
  const canSeeMore = me.role !== 'employee'
  const defaultScope = 'all'
  const scope = searchParams.scope ?? defaultScope
  const board = searchParams.view === 'board'

  let query = supabase.from('tasks').select(TASK_LIST_SELECT)
    .order('is_urgent', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (scope === 'mine') query = query.eq('assignee_id', me.id)
  else if (searchParams.assignee === 'none') query = query.is('assignee_id', null)
  else if (searchParams.assignee) query = query.eq('assignee_id', searchParams.assignee)

  const status = searchParams.status ?? 'active'
  if (!board) {
    if (status === 'active') query = query.not('status', 'in', '(completed,cancelled)')
    else if (status !== 'all') query = query.eq('status', status)
  }
  if (searchParams.client) query = query.eq('client_id', searchParams.client)
  if (searchParams.dept) query = query.eq('department_id', searchParams.dept)

  const [taskResult, lookups, myTaskCountResult, allTaskCountResult] = await Promise.all([
    query,
    getTaskPageLookups({
      includePeople: me.role !== 'employee',
      includeAssignments: me.role !== 'employee',
    }),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', me.id),
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
  ])
  if (taskResult.error) throw taskResult.error
  if (myTaskCountResult.error) throw myTaskCountResult.error
  if (allTaskCountResult.error) throw allTaskCountResult.error
  const tasks = (taskResult.data ?? []) as TaskListItem[]
  const names = me.role === 'employee'
    ? { [me.id]: me.full_name || me.email }
    : nameMap(lookups.people)
  const assignOptions = me.role !== 'employee' ? assigneeOptionsFor(me, lookups) : undefined

  return (
    <TaskSearchProvider
      initialTasks={tasks}
      initialNames={names}
      assignOptions={assignOptions}
      scope={scope === 'mine' ? 'mine' : 'all'}
      status={status}
      client={searchParams.client ?? ''}
      assignee={searchParams.assignee ?? ''}
      department={searchParams.dept ?? ''}
      board={board}
    >
      <TaskFilters
        showScope
        showAssigneeFilter={canSeeMore}
        defaultScope={defaultScope}
        scopeCounts={{ mine: myTaskCountResult.count ?? 0, all: allTaskCountResult.count ?? 0 }}
        clients={lookups.clients.map(c => ({ value: c.id, label: c.company_name }))}
        people={(['super_admin', 'admin'].includes(me.role) ? lookups.staff : assignableFor(me, lookups)).map(p => ({ value: p.id, label: p.full_name || p.email, avatarUrl: p.avatar_url, role: p.role }))}
        departments={lookups.departments.map(d => ({ value: d.id, label: d.name }))}
        action={<ButtonLink href="/tasks/new" size="sm"><Plus className="h-3.5 w-3.5" /> New task</ButtonLink>}
      />
      <TaskSearchResults />
    </TaskSearchProvider>
  )
}
