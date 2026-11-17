import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { addTaskAssigneeHistory, assigneeFilterPeopleFor, getTaskPageLookups, nameMap, normalizeTaskSummaryRows, taskAssigneeIdsForAssignedScope, taskAssigneeOptionsFor, taskAssignerFilterPeopleFor, TASK_SUMMARY_SELECT, type TaskAssignerInfo } from '@/lib/queries'
import { TASK_PAGE_SIZE } from '@/lib/constants'
import { ButtonLink } from '@/components/ui/button'
import { TaskFilters } from '@/components/tasks/TaskFilters'
import { TaskSearchProvider, TaskSearchResults } from '@/components/tasks/TaskSearch'
import { Alert } from '@/components/ui/primitives'
import type { TaskSummary } from '@/types/database'

export const metadata = { title: 'Tasks' }

type SP = { view?: string; scope?: string; status?: string; client?: string; assignee?: string; assigned_by?: string; dept?: string; due?: string; scheduled?: string }

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
  const countAllWithTaskQuery = scope === 'all'
    && (board || status === 'all')
    && !searchParams.assignee
    && !searchParams.assigned_by
    && !searchParams.client
    && !searchParams.dept
    && !searchParams.due

  const lookupsPromise = getTaskPageLookups({
    includePeople: true,
    includeAssignments: true,
  })

  function taskQuery(assignedScopeAssigneeIds: string[]) {
    const taskSelect = countAllWithTaskQuery
      ? supabase.from('tasks').select(TASK_SUMMARY_SELECT, { count: 'exact' })
      : supabase.from('tasks').select(TASK_SUMMARY_SELECT)
    let query = taskSelect
      .order('is_urgent', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(0, TASK_PAGE_SIZE)

    if (scope === 'mine') {
      query = query.eq('assignee_id', me.id)
    } else if (scope === 'assigned') {
      query = query.eq('assigned_by', me.id)
      query = assignedScopeAssigneeIds.length
        ? query.in('assignee_id', assignedScopeAssigneeIds)
        : query.eq('id', '00000000-0000-0000-0000-000000000000')
    } else if (searchParams.assignee) query = query.eq('assignee_id', searchParams.assignee)
    if (scope === 'all' && searchParams.assigned_by) query = query.eq('assigned_by', searchParams.assigned_by)

    if (!board) {
      if (status === 'active') query = query.not('status', 'in', '(completed,cancelled)')
      else if (status !== 'all') query = query.eq('status', status)
    }
    if (searchParams.client) query = query.eq('client_id', searchParams.client)
    if (searchParams.dept) query = query.eq('department_id', searchParams.dept)
    if (searchParams.due) query = query.eq('due_date', searchParams.due)
    return query
  }

  const [lookups, initialTaskResult, myTaskCountResult, allTaskCountResult] = await Promise.all([
    lookupsPromise,
    scope === 'assigned' ? Promise.resolve(null) : taskQuery([]),
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('assignee_id', me.id)
      .not('status', 'in', '(completed,cancelled)'),
    countAllWithTaskQuery
      ? Promise.resolve(null)
      : supabase.from('tasks').select('id', { count: 'exact', head: true }),
  ])

  const assignedScopeAssigneeIds = taskAssigneeIdsForAssignedScope(me, lookups)
  let assignedCountQuery = supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_by', me.id)
  assignedCountQuery = assignedScopeAssigneeIds.length
    ? assignedCountQuery.in('assignee_id', assignedScopeAssigneeIds)
    : assignedCountQuery.eq('id', '00000000-0000-0000-0000-000000000000')

  const taskResultPromise = Promise.resolve(initialTaskResult ?? taskQuery(assignedScopeAssigneeIds))
  // Start the history lookup as soon as the task rows arrive instead of
  // waiting for counts and image signing to finish first.
  const taskHistoryPromise = taskResultPromise.then(async result => {
    if (result.error) throw result.error
    return addTaskAssigneeHistory(
      supabase,
      normalizeTaskSummaryRows((result.data ?? []).slice(0, TASK_PAGE_SIZE) as Parameters<typeof normalizeTaskSummaryRows>[0]),
    )
  })
  const [taskResult, assignedTaskCountResult, tasks] = await Promise.all([
    taskResultPromise,
    assignedCountQuery,
    taskHistoryPromise,
  ])
  if (taskResult.error) throw taskResult.error
  if (myTaskCountResult.error) throw myTaskCountResult.error
  if (allTaskCountResult?.error) throw allTaskCountResult.error
  if (assignedTaskCountResult.error) throw assignedTaskCountResult.error
  const hasMoreTasks = (taskResult.data?.length ?? 0) > TASK_PAGE_SIZE
  const allTaskCount = countAllWithTaskQuery
    ? taskResult.count ?? 0
    : allTaskCountResult?.count ?? 0
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
  const assignOptions = me.role !== 'employee' ? taskAssigneeOptionsFor(me, lookups) : undefined

  return (
    <TaskSearchProvider
      initialTasks={tasks}
      initialTaskCursor={initialTaskCursor}
      initialHasMoreTasks={hasMoreTasks}
      initialNames={names}
      initialTaskAssigners={taskAssigners}
      initialScopeCounts={{
        mine: myTaskCountResult.count ?? 0,
        assigned: assignedTaskCountResult.count ?? 0,
        all: allTaskCount,
      }}
      assignOptions={assignOptions}
      editableTaskActorId={me.id}
      scope={scope}
      status={status}
      client={searchParams.client ?? ''}
      assignee={searchParams.assignee ?? ''}
      assignedBy={searchParams.assigned_by ?? ''}
      department={searchParams.dept ?? ''}
      due={searchParams.due ?? ''}
      board={board}
    >
      <div className="lg:-mx-2">
        {searchParams.scheduled === '1' && <Alert tone="success">Task schedule saved. The task will appear here when its first scheduled assignment runs.</Alert>}
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
          action={<ButtonLink href="/tasks/new" prefetch={false} size="sm"><Plus className="h-3.5 w-3.5" /> New task</ButtonLink>}
        />
        <TaskSearchResults />
      </div>
    </TaskSearchProvider>
  )
}
