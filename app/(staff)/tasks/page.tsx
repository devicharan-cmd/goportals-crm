import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assigneeFilterPeopleFor, getTaskPageBootstrap, nameMap, normalizeTaskSummaryRows, taskAssigneeOptionsFor, taskAssignerFilterPeopleFor, TASK_SUMMARY_SELECT, type TaskAssignerInfo } from '@/lib/queries'
import { TASK_PAGE_SIZE } from '@/lib/constants'
import { ButtonLink } from '@/components/ui/button'
import { TaskFilters } from '@/components/tasks/TaskFilters'
import { TaskSearchProvider, TaskSearchResults } from '@/components/tasks/TaskSearch'
import type { TaskSummary } from '@/types/database'

export const metadata = { title: 'Tasks' }

type SP = { view?: string; scope?: string; status?: string; client?: string; assignee?: string; assigned_by?: string; dept?: string; due?: string; date_by?: string }

export default async function TasksPage(props: { searchParams: Promise<SP> }) {
  const searchParams = await props.searchParams
  const me = await requireStaff()
  const supabase = await createClient()

  // RLS limits each role to the tasks they are allowed to see.
  const canSeeMore = me.role !== 'employee'
  const defaultScope = 'mine'
  const scope = searchParams.scope === 'assigned' || searchParams.scope === 'all' || searchParams.scope === 'mine'
    ? searchParams.scope
    : defaultScope
  const board = searchParams.view !== 'list'
  const status = searchParams.status ?? 'all'
  const bootstrapPromise = getTaskPageBootstrap()

  function taskQuery() {
    let query = supabase.from('tasks').select(TASK_SUMMARY_SELECT)
      .order('is_urgent', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(0, TASK_PAGE_SIZE)

    if (scope === 'mine') {
      query = query.eq('assignee_id', me.id)
    } else if (scope === 'assigned') {
      query = query.eq('assigned_by', me.id)
    } else if (searchParams.assignee) query = query.eq('assignee_id', searchParams.assignee)
    if (scope === 'all' && searchParams.assigned_by) query = query.eq('assigned_by', searchParams.assigned_by)

    if (!board) {
      if (status === 'active') query = query.not('status', 'in', '(completed,cancelled)')
      else if (status !== 'all') query = query.eq('status', status)
    }
    if (searchParams.client) query = query.eq('client_id', searchParams.client)
    if (searchParams.dept) query = query.eq('department_id', searchParams.dept)
    if (searchParams.due) {
      if (searchParams.date_by === 'assigned') {
        const start = `${searchParams.due}T00:00:00.000Z`
        const end = `${searchParams.due}T23:59:59.999Z`
        query = query.gte('assigned_at', start).lte('assigned_at', end)
      } else if (searchParams.date_by === 'completed') {
        const start = `${searchParams.due}T00:00:00.000Z`
        const end = `${searchParams.due}T23:59:59.999Z`
        query = query.gte('closed_at', start).lte('closed_at', end)
      } else {
        query = query.eq('due_date', searchParams.due)
      }
    }
    return query
  }

  // Start the task query alongside the independent lookup/count requests.
  const taskResultPromise = taskQuery()
  const [bootstrap, taskResult] = await Promise.all([
    bootstrapPromise,
    taskResultPromise,
  ])
  if (taskResult.error) throw taskResult.error
  const { lookups, counts: taskCounts } = bootstrap
  const tasks = normalizeTaskSummaryRows(
    (taskResult.data ?? []).slice(0, TASK_PAGE_SIZE) as Parameters<typeof normalizeTaskSummaryRows>[0],
  )
  const hasMoreTasks = (taskResult.data?.length ?? 0) > TASK_PAGE_SIZE
  const allTaskCount = Number(taskCounts?.all_visible_count ?? 0)
  const lastTask = tasks[tasks.length - 1]
  const initialTaskCursor = hasMoreTasks && lastTask
    ? { id: lastTask.id, is_urgent: lastTask.is_urgent, due_date: lastTask.due_date, created_at: lastTask.created_at }
    : null
  const directoryPeople = lookups.directoryStaff
  const assigners = taskAssignerFilterPeopleFor(me, lookups).map(person => ({
    value: person.id,
    label: person.full_name || person.email || 'Staff member',
    avatarUrl: person.avatar_url,
    role: person.role,
  }))
  const names = me.role === 'employee'
    ? { [me.id]: me.full_name || me.email }
    : nameMap(lookups.people)
  const taskAssigners: Record<string, TaskAssignerInfo> = Object.fromEntries([
    ...directoryPeople.map(person => [person.id, {
      name: person.full_name || 'Staff member',
      role: person.role,
      avatarUrl: person.avatar_url,
    }] as const),
    ...lookups.people.map(person => [person.id, {
      name: person.full_name || person.email,
      role: person.role,
      avatarUrl: person.avatar_url,
    }] as const),
  ])
  const assignOptions = taskAssigneeOptionsFor(me, lookups)

  return (
    <TaskSearchProvider
      initialTasks={tasks}
      initialTaskCursor={initialTaskCursor}
      initialHasMoreTasks={hasMoreTasks}
      initialNames={names}
      initialTaskAssigners={taskAssigners}
      initialScopeCounts={{
        mine: Number(taskCounts?.mine_active_count ?? 0),
        assigned: Number(taskCounts?.assigned_by_me_count ?? 0),
        all: allTaskCount,
      }}
      assignOptions={assignOptions}
      editableTaskActorId={me.id}
      editableTaskRole={me.role}
      scope={scope}
      status={status}
      client={searchParams.client ?? ''}
      assignee={searchParams.assignee ?? ''}
      assignedBy={searchParams.assigned_by ?? ''}
      department={searchParams.dept ?? ''}
      due={searchParams.due ?? ''}
      dateBy={searchParams.date_by === 'assigned' ? 'assigned' : searchParams.date_by === 'completed' ? 'completed' : 'due'}
      board={board}
    >
      <div>
        <TaskFilters
          showScope
          showAssigneeFilter={canSeeMore}
          defaultScope={defaultScope}
          assigners={assigners}
          clients={lookups.clients.map(client => ({
            value: client.id,
            label: client.company_name,
            imagePath: client.company_profile_image_path,
          }))}
          people={assigneeFilterPeopleFor(me, lookups).map(p => ({ value: p.id, label: p.full_name || p.email, avatarUrl: p.avatar_url, role: p.role }))}
          departments={lookups.departments.map(d => ({ value: d.id, label: d.name }))}
          action={<ButtonLink href="/tasks/new" prefetch={false} size="sm" className="max-sm:h-8 max-sm:w-8 max-sm:justify-center max-sm:gap-0 max-sm:p-0"><Plus className="h-3.5 w-3.5" /><span className="max-sm:sr-only">New task</span></ButtonLink>}
        />
        <TaskSearchResults />
      </div>
    </TaskSearchProvider>
  )
}
