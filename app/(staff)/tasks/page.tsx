import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assigneeFilterPeopleFor, assigneeOptionsFor, getClientProfileImageUrls, getTaskPageLookups, nameMap, normalizeTaskSummaryRows, taskAssigneeIdsForAssignedScope, taskAssignerFilterPeopleFor, TASK_SUMMARY_SELECT, type TaskAssignerInfo } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { TaskFilters } from '@/components/tasks/TaskFilters'
import { TaskSearchProvider, TaskSearchResults } from '@/components/tasks/TaskSearch'
import type { StaffDirectoryEntry, TaskSummary } from '@/types/database'

export const metadata = { title: 'Tasks' }

type SP = { view?: string; scope?: string; status?: string; client?: string; assignee?: string; assigned_by?: string; dept?: string; due?: string }

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

  const lookups = await getTaskPageLookups({
    includePeople: true,
    includeAssignments: true,
  })
  const assignedScopeAssigneeIds = taskAssigneeIdsForAssignedScope(me, lookups)

  let query = supabase.from('tasks').select(TASK_SUMMARY_SELECT)
    .order('is_urgent', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (scope === 'mine') {
    query = query.eq('assignee_id', me.id)
  } else if (scope === 'assigned') {
    query = query.eq('assigned_by', me.id)
    query = assignedScopeAssigneeIds.length
      ? query.in('assignee_id', assignedScopeAssigneeIds)
      : query.eq('id', '00000000-0000-0000-0000-000000000000')
  } else if (searchParams.assignee) query = query.eq('assignee_id', searchParams.assignee)
  if (scope === 'all' && searchParams.assigned_by) query = query.eq('assigned_by', searchParams.assigned_by)

  const status = searchParams.status ?? 'all'
  if (!board) {
    if (status === 'active') query = query.not('status', 'in', '(completed,cancelled)')
    else if (status !== 'all') query = query.eq('status', status)
  }
  if (searchParams.client) query = query.eq('client_id', searchParams.client)
  if (searchParams.dept) query = query.eq('department_id', searchParams.dept)
  if (searchParams.due) query = query.eq('due_date', searchParams.due)

  let assignedCountQuery = supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_by', me.id)
  assignedCountQuery = assignedScopeAssigneeIds.length
    ? assignedCountQuery.in('assignee_id', assignedScopeAssigneeIds)
    : assignedCountQuery.eq('id', '00000000-0000-0000-0000-000000000000')

  const [taskResult, myTaskCountResult, allTaskCountResult, assignedTaskCountResult, assignerResult] = await Promise.all([
    query,
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('assignee_id', me.id)
      .not('status', 'in', '(completed,cancelled)'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
    assignedCountQuery,
    supabase.rpc('staff_directory'),
  ])
  if (taskResult.error) throw taskResult.error
  if (myTaskCountResult.error) throw myTaskCountResult.error
  if (allTaskCountResult.error) throw allTaskCountResult.error
  if (assignedTaskCountResult.error) throw assignedTaskCountResult.error
  if (assignerResult.error) throw assignerResult.error
  const tasks = normalizeTaskSummaryRows((taskResult.data ?? []) as Parameters<typeof normalizeTaskSummaryRows>[0])
  const directoryPeople = (assignerResult.data ?? []) as StaffDirectoryEntry[]
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
  const assignOptions = me.role !== 'employee' ? assigneeOptionsFor(me, lookups) : undefined
  const clientImageUrlByPath = await getClientProfileImageUrls(lookups.clients)

  return (
    <TaskSearchProvider
      initialTasks={tasks}
      initialNames={names}
      initialTaskAssigners={taskAssigners}
      assignOptions={assignOptions}
      editableAssigneeId={me.role === 'super_admin' ? undefined : me.id}
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
        <TaskFilters
          showScope
          showAssigneeFilter={canSeeMore}
          defaultScope={defaultScope}
          scopeCounts={{
            mine: myTaskCountResult.count ?? 0,
            assigned: assignedTaskCountResult.count ?? 0,
            all: allTaskCountResult.count ?? 0,
          }}
          assigners={assigners}
          clients={lookups.clients.map(client => ({
            value: client.id,
            label: client.company_name,
            avatarUrl: client.company_profile_image_path ? clientImageUrlByPath[client.company_profile_image_path] : null,
          }))}
          people={assigneeFilterPeopleFor(me, lookups).map(p => ({ value: p.id, label: p.full_name || p.email, avatarUrl: p.avatar_url, role: p.role }))}
          departments={lookups.departments.map(d => ({ value: d.id, label: d.name }))}
          action={<ButtonLink href="/tasks/new" size="sm"><Plus className="h-3.5 w-3.5" /> New task</ButtonLink>}
        />
        <TaskSearchResults />
      </div>
    </TaskSearchProvider>
  )
}
