import Link from 'next/link'
import { AlarmClock, CheckSquare, Flame, Inbox, LockKeyhole, Plus, ShieldCheck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { getTaskAssigneeHistory, nameMap, TASK_SUMMARY_SELECT, TICKET_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Avatar, Card, CardHeader, EmptyState, StatCard } from '@/components/ui/primitives'
import { DueDate, PriorityBadge } from '@/components/ui/badges'
import { TaskTable } from '@/components/tasks/TaskTable'
import { TaskPreviousAssignees } from '@/components/tasks/TaskPreviousAssignees'
import { ClaimButton } from '@/components/tasks/ClaimButton'
import { DashboardTaskPanel } from '@/components/tasks/DashboardTaskPanel'
import type { TicketListItem } from '@/components/shared/TicketTable'
import { capacityColor, capacityTextColor, cn, formatRelative, taskCode, ticketCode, todayDateKey } from '@/lib/utils'
import type { TaskSummary } from '@/types/database'

export const metadata = { title: 'Dashboard' }

// The dashboard only renders list fields. Avoid transferring full task rows
// (including long descriptions and scheduler metadata) for these panels.
const DASHBOARD_TASK_SELECT = `${TASK_SUMMARY_SELECT}, estimated_hours`
type DashboardTask = TaskSummary & { estimated_hours: number | null }

// The server runs in UTC; staff are in India, so both the greeting and the date
// below have to be read in IST or they disagree either side of midnight.
const IST = 'Asia/Kolkata'

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: IST }).format(new Date())) % 24
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: IST })
    .formatToParts(new Date())
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('weekday')}, ${get('day')} ${get('month')}`
}

export default async function DashboardPage() {
  const me = await requireStaff()
  const supabase = await createClient()
  const isManager = ['super_admin', 'manager'].includes(me.role)
  // Approving a client is the super admin's call alone.
  const isSuperAdmin = me.role === 'super_admin'
  const isTeamLead = me.role === 'team_lead'
  const canSeeTickets = isManager || isTeamLead
  const isEmployee = me.role === 'employee'
  const today = todayDateKey()

  const dashboardDataPromise = Promise.all([
    supabase.from('tasks').select(DASHBOARD_TASK_SELECT).eq('assignee_id', me.id).not('status', 'in', '(completed,cancelled)')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    // Only employees render the detailed "Due today" panel. The count still
    // comes from the combined dashboard RPC for every role.
    isEmployee
      ? supabase.from('tasks').select(DASHBOARD_TASK_SELECT).eq('assignee_id', me.id)
          .not('status', 'in', '(completed,cancelled)').eq('due_date', today)
          .order('priority').order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [], count: 0, error: null }),
    supabase.from('tasks').select(DASHBOARD_TASK_SELECT).eq('is_urgent', true).is('assignee_id', null).not('status', 'in', '(completed,cancelled)')
      .order('priority').order('created_at').limit(5),
    canSeeTickets
      ? supabase.from('tickets').select(TICKET_LIST_SELECT).eq('status', 'unassigned')
          .order('created_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [], count: 0, error: null }),
    // The manager workload panel is the only shared panel that needs the
    // full staff name/avatar map. Avoid that directory read for employees.
    isManager
      ? supabase.from('profiles').select('id, full_name, avatar_url')
      : Promise.resolve({ data: [], count: 0, error: null }),
    isManager
      ? supabase.from('tasks').select(DASHBOARD_TASK_SELECT).not('status', 'in', '(completed,cancelled)')
          .order('is_urgent', { ascending: false })
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(15)
      : Promise.resolve({ data: [], count: 0, error: null }),
    isManager
      ? supabase.from('tasks').select(DASHBOARD_TASK_SELECT).eq('status', 'completed')
          .order('closed_at', { ascending: false, nullsFirst: false })
          .limit(15)
      : Promise.resolve({ data: [], count: 0, error: null }),
    isEmployee
      ? supabase.from('tasks').select(DASHBOARD_TASK_SELECT).eq('assignee_id', me.id).eq('status', 'completed')
          .order('closed_at', { ascending: false, nullsFirst: false }).limit(15)
      : Promise.resolve({ data: [], error: null }),
  ])

  const dashboardCountsPromise = supabase.rpc('staff_dashboard_counts', { p_today: today })

  const teamLeadDataPromise = isTeamLead
    ? (async () => {
        const [peopleResult, membershipsResult] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email, avatar_url, role, weekly_capacity_hours'),
          supabase.from('department_members').select('department_id, profile_id'),
        ])
        if (peopleResult.error) throw peopleResult.error
        if (membershipsResult.error) throw membershipsResult.error

        const memberships = membershipsResult.data ?? []
        const myDepartmentIds = new Set(
          memberships.filter(member => member.profile_id === me.id).map(member => member.department_id),
        )
        const departmentMemberIds = new Set(
          memberships
            .filter(member => member.profile_id !== me.id && myDepartmentIds.has(member.department_id))
            .map(member => member.profile_id),
        )
        const peopleById = new Map((peopleResult.data ?? []).map(person => [person.id, person]))
        const deptMateIds = Array.from(departmentMemberIds)
          .filter(id => peopleById.get(id)?.role === 'employee')
        const deptTasks: DashboardTask[] = []
        let afterId: string | null = null
        while (deptMateIds.length > 0) {
          let query = supabase.from('tasks').select(DASHBOARD_TASK_SELECT)
            .in('assignee_id', deptMateIds)
            .not('status', 'in', '(completed,cancelled)')
            .order('id', { ascending: true })
            .limit(100)
          if (afterId) query = query.gt('id', afterId)
          const { data, error } = await query
          if (error) throw error
          const page = (data ?? []) as unknown as DashboardTask[]
          deptTasks.push(...page)
          if (page.length < 100) break
          afterId = page[page.length - 1].id
        }
        deptTasks.sort((a, b) => {
          if (a.due_date === null) return b.due_date === null ? b.created_at.localeCompare(a.created_at) : 1
          if (b.due_date === null) return -1
          return a.due_date.localeCompare(b.due_date) || b.created_at.localeCompare(a.created_at)
        })

        return { people: peopleResult.data ?? [], deptMateIds, deptTasks }
      })()
    : Promise.resolve(null)

  // The compact urgent preview includes reassignment history. Avoid calling
  // the RPC entirely when no urgent rows are present while preserving that UI
  // when there is work to show.
  const urgentHistoryPromise = dashboardDataPromise.then(async ([, , urgentResult]) => {
    if (urgentResult.error) throw urgentResult.error
    return getTaskAssigneeHistory(
      supabase,
      (urgentResult.data ?? []).map(task => task.id),
    )
  })

  const [
    [mine, dueTodayTasksResult, urgent, requests, people, allWorking, allDone, myCompleted],
    dashboardCountsResult,
    teamLeadData,
    urgentHistory,
  ] = await Promise.all([dashboardDataPromise, dashboardCountsPromise, teamLeadDataPromise, urgentHistoryPromise])

  for (const result of [mine, dueTodayTasksResult, urgent, requests, people, allWorking, allDone, myCompleted]) {
    if (result.error) throw result.error
  }
  if (dashboardCountsResult.error) throw dashboardCountsResult.error
  const dashboardCounts = dashboardCountsResult.data?.[0]

  const rawMyTasks = (mine.data ?? []) as unknown as DashboardTask[]
  const rawUrgentTasks = (urgent.data ?? []) as unknown as DashboardTask[]
  const rawDueTodayTasks = (dueTodayTasksResult.data ?? []) as unknown as DashboardTask[]
  const clientRequests = (requests.data ?? []) as unknown as TicketListItem[]
  const names = nameMap(people.data ?? [])
  const assigneeAvatarUrls = Object.fromEntries((people.data ?? []).map(person => [person.id, person.avatar_url]))
  const myOpenCount = Number(dashboardCounts?.my_open_count ?? 0)
  const dueTodayCount = Number(dashboardCounts?.due_today_count ?? 0)
  const urgentCount = Number(dashboardCounts?.urgent_waiting_count ?? 0)
  const requestCount = Number(dashboardCounts?.unassigned_ticket_count ?? 0)
  const rawWorkingTasks = (allWorking.data ?? []) as unknown as DashboardTask[]
  const rawDoneTasks = (allDone.data ?? []) as unknown as DashboardTask[]
  const workingCount = Number(dashboardCounts?.working_count ?? 0)
  const doneCount = Number(dashboardCounts?.done_count ?? 0)

  // Employee branch: pure client-side slices of `myTasks`, plus the one extra "completed" query above.
  const rawMyCompletedTasks = (myCompleted.data ?? []) as unknown as DashboardTask[]
  const rawTeamTasks = (teamLeadData?.deptTasks ?? []) as DashboardTask[]
  const urgentTasks = rawUrgentTasks.map(task => ({
    ...task,
    assignee_history: urgentHistory.get(task.id) ?? [],
  }))
  const myTasks = rawMyTasks
  const dueTodayTasks = rawDueTodayTasks
  const workingTasks = rawWorkingTasks
  const doneTasks = rawDoneTasks
  const myCompletedTasks = rawMyCompletedTasks
  const teamTasks = rawTeamTasks
  const inProgressTasks = myTasks.filter(t => t.status === 'in_manual_process' || t.status === 'in_system_process')
  const readyForReviewTasks = myTasks.filter(t => t.status === 'ready_for_review')

  // Team leads only see tasks assigned to their department.
  const deptMateIds = teamLeadData?.deptMateIds ?? []
  const pendingReviews = teamTasks.filter(t => t.status === 'ready_for_review')
  const workload = isTeamLead && teamLeadData
    ? deptMateIds.map(id => {
        const person = teamLeadData.people.find(p => p.id === id)!
        const openTasks = teamTasks.filter(t => t.assignee_id === id)
        const hours = openTasks.reduce((s, t) => s + Number(t.estimated_hours ?? 3), 0)
        return { id, name: person.full_name || person.email, avatarUrl: person.avatar_url, open: openTasks.length, hours,
                 pct: Math.round((hours / (person.weekly_capacity_hours || 40)) * 100) }
      }).sort((a, b) => b.pct - a.pct)
    : []

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[#789C20]">{todayInIndia()}</p>
          <h1 className="text-2xl font-bold">{greeting()}, {me.full_name.split(' ')[0] || 'there'} 👋</h1>
        </div>
        {!isManager && <ButtonLink href="/tasks/new" prefetch={false}><Plus className="h-4 w-4" /> New task</ButtonLink>}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My open tasks" value={myOpenCount} icon={<CheckSquare className="h-5 w-5" />} href="/tasks" prefetch={false} />
        <StatCard label="Due today" value={dueTodayCount} icon={<AlarmClock className="h-5 w-5" />} tone={dueTodayCount ? 'amber' : 'lime'} href="/tasks" prefetch={false} />
        <StatCard label="Urgent waiting" value={urgentCount} icon={<Flame className="h-5 w-5" />} tone={urgentCount ? 'red' : 'lime'} href="/urgent" />
        {isSuperAdmin
          ? <StatCard label="Clients awaiting approval" value={Number(dashboardCounts?.pending_client_count ?? 0)} icon={<ShieldCheck className="h-5 w-5" />} tone={dashboardCounts?.pending_client_count ? 'amber' : 'lime'} href="/admin/approvals" />
          : canSeeTickets
            ? <StatCard label="New client tickets" value={requestCount} icon={<Inbox className="h-5 w-5" />} tone="brand" href="/tickets" />
            : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <CardHeader title="My tasks" description="Soonest deadline first" action={<Link href="/tasks" prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
          <TaskTable
            tasks={myTasks.slice(0, 8)}
            names={names}
            showAssignee={false}
            empty={{ title: "You're all caught up", description: 'Nothing is assigned to you. Pick something from the urgent pool?' }}
          />
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader
              title={<span className="flex items-center gap-1.5"><Flame className="h-4 w-4 text-red-600" /> Urgent pool</span>}
              action={<Link href="/urgent" className="text-xs font-semibold text-[#045E80]">Open</Link>}
            />
            {urgentTasks.length === 0 ? (
              <EmptyState title="Nothing urgent" description="No urgent tasks are waiting." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {urgentTasks.map(t => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <Link href={`/tasks/${t.id}`} prefetch={false} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs font-semibold text-[#045E80]">{taskCode(t.task_number)}</span>{t.title}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <span className="truncate">{t.client?.company_name} · <DueDate date={t.due_date} dueAt={t.due_at} status={t.status} /></span>
                        {t.visibility === 'private' && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200" title="Visible only to authorized internal staff"><LockKeyhole aria-hidden="true" className="h-3 w-3" />Private</span>}
                      </p>
                      <TaskPreviousAssignees history={t.assignee_history} compact />
                    </Link>
                    <ClaimButton taskId={t.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canSeeTickets && (
            <Card className="overflow-hidden">
              <CardHeader
                title="New client tickets"
                description="Raised from the portal, not yet assigned"
                action={<Link href="/tickets" prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>}
              />
              {clientRequests.length === 0 ? (
                <EmptyState title="No new tickets" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {clientRequests.map(t => (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                        {t.priority ? <PriorityBadge priority={t.priority} /> : <span className="w-7 text-center text-xs text-slate-300">—</span>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs font-semibold text-[#045E80]">{ticketCode(t.ticket_number)}</span>{t.subject}</p>
                          <p className="truncate text-xs text-slate-500">{t.client?.company_name} · {formatRelative(t.created_at)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      {isEmployee && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader title="Due today" action={<Link href={`/tasks?due=${today}`} prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
            <TaskTable tasks={dueTodayTasks} names={names} showAssignee={false} empty={{ title: 'Nothing due today' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Active work" description="In manual process or in system process" action={<Link href="/tasks?status=active" prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
            <TaskTable tasks={inProgressTasks} names={names} showAssignee={false} empty={{ title: 'Nothing in manual process' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="In review" description="Waiting on your team lead — you can't self-approve" action={<Link href="/tasks?status=ready_for_review" prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
            <TaskTable tasks={readyForReviewTasks} names={names} showAssignee={false} empty={{ title: 'Nothing waiting on review' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Completed" description="Most recent first" action={<Link href="/tasks?status=completed" prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
            <TaskTable tasks={myCompletedTasks} names={names} showAssignee={false} empty={{ title: 'Nothing completed yet' }} />
          </Card>
        </div>
      )}

      {isTeamLead && (
        deptMateIds.length === 0 ? (
          <Card className="mt-4">
            <EmptyState icon={<Users className="h-6 w-6" />} title="No department yet" description="Ask a manager to add you to a department to see your team's work here." />
          </Card>
        ) : (
          <div className="mt-4 space-y-4">
            <Card className="overflow-hidden">
              <CardHeader title="My team" action={<Link href="/team" className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View team</Link>} />
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                {workload.map(w => (
                  <Link key={w.id} href={`/team/${w.id}`} className="rounded-lg border border-slate-100 p-3 transition hover:[box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)]">
                    <div className="flex items-center gap-2">
                      <Avatar name={w.name} src={w.avatarUrl} size="sm" />
                      <p className="truncate text-sm font-medium text-slate-900">{w.name}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{w.open} open</span>
                      <span className={cn('font-semibold', capacityTextColor(w.pct))}>{w.pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn('h-full rounded-full', capacityColor(w.pct))} style={{ width: `${Math.min(100, w.pct)}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
              <Card className="overflow-hidden">
                <CardHeader title="Team tasks" description="Your department's open work" action={<Link href="/tasks?scope=all&status=active" prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
                <TaskTable tasks={teamTasks.slice(0, 10)} names={names} empty={{ title: 'Nothing open on the team' }} />
              </Card>
              <Card className="overflow-hidden">
                <CardHeader title="Pending reviews" description="Submitted for your approval" action={<Link href="/tasks?scope=all&status=ready_for_review" prefetch={false} className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
                <TaskTable tasks={pendingReviews} names={names} empty={{ title: 'Nothing waiting on you' }} />
              </Card>
            </div>

          </div>
        )
      )}

      {isManager && (
        <div className="mt-4">
          <DashboardTaskPanel
            workingTasks={workingTasks}
            doneTasks={doneTasks}
            workingCount={workingCount}
            doneCount={doneCount}
            names={names}
            assigneeAvatarUrls={assigneeAvatarUrls}
          />
        </div>
      )}
    </>
  )
}
