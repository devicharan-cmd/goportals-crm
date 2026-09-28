import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assignableFor, assigneeOptionsFor, getStaffLookups, nameMap, TASK_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/primitives'
import { TaskFilters } from '@/components/tasks/TaskFilters'
import { TaskTable } from '@/components/tasks/TaskTable'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { parseTaskCode } from '@/lib/utils'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'Tasks' }

type SP = { view?: string; scope?: string; status?: string; client?: string; assignee?: string; dept?: string; q?: string }

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const me = await requireStaff()
  const supabase = createClient()
  const lookups = await getStaffLookups()

  // Employees only ever see their own + urgent tasks (RLS), so "My tasks" vs "All" matters for managers/admins.
  const canSeeMore = me.role !== 'employee'
  // Super admins start on all tasks (nothing is usually assigned to them); others on their own.
  const defaultScope = me.role === 'super_admin' ? 'all' : 'mine'
  const scope = canSeeMore ? searchParams.scope ?? defaultScope : 'mine'
  const board = searchParams.view === 'board'

  let query = supabase.from('tasks').select(TASK_LIST_SELECT)
    .order('is_urgent', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (scope === 'mine' && !parseTaskCode(searchParams.q)) query = query.eq('assignee_id', me.id)
  else if (searchParams.assignee === 'none') query = query.is('assignee_id', null)
  else if (searchParams.assignee) query = query.eq('assignee_id', searchParams.assignee)

  const status = searchParams.status ?? 'active'
  if (!board && !parseTaskCode(searchParams.q)) {
    if (status === 'active') query = query.neq('status', 'done')
    else if (status !== 'all') query = query.eq('status', status)
  }
  if (searchParams.client) query = query.eq('client_id', searchParams.client)
  if (searchParams.dept) query = query.eq('department_id', searchParams.dept)
  const idSearch = parseTaskCode(searchParams.q)
  if (idSearch) query = query.eq('task_number', idSearch)
  else if (searchParams.q) query = query.ilike('title', `%${searchParams.q.replace(/[%_,()]/g, ' ')}%`)

  const { data } = await query
  const tasks = (data ?? []) as TaskListItem[]
  const names = nameMap(lookups.people)
  const assignOptions = me.role !== 'employee' ? assigneeOptionsFor(me, lookups) : undefined

  return (
    <>
      <PageHeader
        title="Tasks"
        description={scope === 'mine' ? 'Tasks assigned to you.'
          : me.role === 'super_admin' ? 'Every task across all clients.' : 'Tasks of your employees, departments and clients.'}
        actions={<ButtonLink href="/tasks/new"><Plus className="h-4 w-4" /> New task</ButtonLink>}
      />
      <TaskFilters
        showScope={canSeeMore}
        defaultScope={defaultScope}
        clients={lookups.clients.map(c => ({ value: c.id, label: c.company_name }))}
        people={(me.role === 'super_admin' ? lookups.staff : assignableFor(me, lookups)).map(p => ({ value: p.id, label: p.full_name || p.email }))}
        departments={lookups.departments.map(d => ({ value: d.id, label: d.name }))}
      />
      {board ? (
        <TaskBoard tasks={tasks} names={names} assignOptions={assignOptions} />
      ) : (
        <Card className="overflow-hidden">
          <TaskTable
            tasks={tasks}
            names={names}
            assignOptions={assignOptions}
            empty={{
              title: scope === 'mine' ? 'Nothing assigned to you' : status === 'active' && !searchParams.q ? 'No open tasks' : 'No tasks match these filters',
              description: scope === 'mine' ? 'Check the urgent pool or create a task.'
                : status === 'active' && !searchParams.q ? 'Finished tasks are hidden. Choose “Status: all” to see them.'
                : 'Try clearing the filters.',
              action: scope === 'mine' ? <ButtonLink href="/urgent" variant="secondary">Open urgent pool</ButtonLink> : undefined,
            }}
          />
        </Card>
      )}
    </>
  )
}
