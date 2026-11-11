import Link from 'next/link'
import { AlarmClock, CheckSquare, Flame, Inbox, Plus, ShieldCheck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { getStaffLookups, nameMap, profileIdsSharingDepartment, TASK_LIST_SELECT, TICKET_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Avatar, Card, CardHeader, EmptyState, StatCard } from '@/components/ui/primitives'
import { DueDate, PriorityBadge } from '@/components/ui/badges'
import { TaskTable } from '@/components/tasks/TaskTable'
import { ClaimButton } from '@/components/tasks/ClaimButton'
import { DashboardTaskPanel } from '@/components/tasks/DashboardTaskPanel'
import type { TicketListItem } from '@/components/shared/TicketTable'
import { capacityColor, capacityTextColor, cn, formatRelative, taskCode, ticketCode, todayDateKey } from '@/lib/utils'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'Dashboard' }

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

  const [mine, myOpenCountResult, dueTodayCountResult, dueTodayTasksResult, urgent, requests, approvals, people, allWorking, allDone, myCompleted, lookups] = await Promise.all([
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('assignee_id', me.id).not('status', 'in', '(completed,cancelled)')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', me.id)
      .not('status', 'in', '(completed,cancelled)'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', me.id)
      .not('status', 'in', '(completed,cancelled)').eq('due_date', today),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('assignee_id', me.id)
      .not('status', 'in', '(completed,cancelled)').eq('due_date', today)
      .order('priority').order('created_at', { ascending: false }).limit(50),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('is_urgent', true).is('assignee_id', null).not('status', 'in', '(completed,cancelled)')
      .order('priority').order('created_at').limit(5),
    canSeeTickets
      ? supabase.from('tickets').select(TICKET_LIST_SELECT).eq('status', 'unassigned')
          .order('created_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
    isSuperAdmin
      ? supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    supabase.from('profiles').select('id, full_name, email'),
    isManager
      ? supabase.from('tasks').select(TASK_LIST_SELECT, { count: 'exact' }).not('status', 'in', '(completed,cancelled)')
          .order('is_urgent', { ascending: false })
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(15)
      : Promise.resolve({ data: [], count: 0 }),
    isManager
      ? supabase.from('tasks').select(TASK_LIST_SELECT, { count: 'exact' }).eq('status', 'completed')
          .order('closed_at', { ascending: false, nullsFirst: false })
          .limit(15)
      : Promise.resolve({ data: [], count: 0 }),
    isEmployee
      ? supabase.from('tasks').select(TASK_LIST_SELECT).eq('assignee_id', me.id).eq('status', 'completed')
          .order('closed_at', { ascending: false, nullsFirst: false }).limit(15)
      : Promise.resolve({ data: [] }),
    isTeamLead ? getStaffLookups() : Promise.resolve(null),
  ])

  const myTasks = (mine.data ?? []) as TaskListItem[]
  const urgentTasks = (urgent.data ?? []) as TaskListItem[]
  const dueTodayTasks = (dueTodayTasksResult.data ?? []) as TaskListItem[]
  const clientRequests = (requests.data ?? []) as unknown as TicketListItem[]
  const names = nameMap(people.data ?? [])
  if (myOpenCountResult.error) throw myOpenCountResult.error
  if (dueTodayCountResult.error) throw dueTodayCountResult.error
  if (dueTodayTasksResult.error) throw dueTodayTasksResult.error
  const myOpenCount = myOpenCountResult.count ?? 0
  const dueTodayCount = dueTodayCountResult.count ?? 0
  const workingTasks = (allWorking.data ?? []) as TaskListItem[]
  const doneTasks = (allDone.data ?? []) as TaskListItem[]
  const workingCount = allWorking.count ?? 0
  const doneCount = allDone.count ?? 0

  // Employee branch: pure client-side slices of `myTasks`, plus the one extra "completed" query above.
  const myCompletedTasks = (myCompleted.data ?? []) as TaskListItem[]
  const inProgressTasks = myTasks.filter(t => t.status === 'in_progress' || t.status === 'in_system_process')
  const readyForReviewTasks = myTasks.filter(t => t.status === 'ready_for_review')

  // Team leads only see tasks assigned to their department.
  const deptMateIds = isTeamLead && lookups
    ? Array.from(profileIdsSharingDepartment(me.id, lookups)).filter(id => lookups.people.find(p => p.id === id)?.role === 'employee')
    : []

  const [deptTasksRes] = await Promise.all([
    deptMateIds.length
      ? supabase.from('tasks').select(TASK_LIST_SELECT).in('assignee_id', deptMateIds).not('status', 'in', '(completed,cancelled)')
          .order('due_date', { ascending: true, nullsFirst: false }).limit(100)
      : Promise.resolve({ data: [] }),
  ])

  const teamTasks = (deptTasksRes.data ?? []) as TaskListItem[]
  const pendingReviews = teamTasks.filter(t => t.status === 'ready_for_review')
  const workload = isTeamLead && lookups
    ? deptMateIds.map(id => {
        const person = lookups.people.find(p => p.id === id)!
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
        {!isManager && <ButtonLink href="/tasks/new"><Plus className="h-4 w-4" /> New task</ButtonLink>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="My open tasks" value={myOpenCount} icon={<CheckSquare className="h-5 w-5" />} href="/tasks" />
        <StatCard label="Due today" value={dueTodayCount} icon={<AlarmClock className="h-5 w-5" />} tone={dueTodayCount ? 'amber' : 'lime'} href="/tasks" />
        <StatCard label="Urgent waiting" value={urgentTasks.length} icon={<Flame className="h-5 w-5" />} tone={urgentTasks.length ? 'red' : 'lime'} href="/urgent" />
        {isSuperAdmin
          ? <StatCard label="Clients awaiting approval" value={approvals.count ?? 0} icon={<ShieldCheck className="h-5 w-5" />} tone={approvals.count ? 'amber' : 'lime'} href="/admin/approvals" />
          : canSeeTickets
            ? <StatCard label="New client tickets" value={clientRequests.length} icon={<Inbox className="h-5 w-5" />} tone="brand" href="/tickets" />
            : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader title="My tasks" description="Soonest deadline first" action={<Link href="/tasks" className="text-xs font-semibold text-[#045E80] hover:text-[#034C68]">View all</Link>} />
          <TaskTable
            tasks={myTasks.slice(0, 8)}
            names={names}
            showAssignee={false}
            empty={{ title: "You're all caught up", description: 'Nothing is assigned to you. Pick something from the urgent pool?' }}
          />
        </Card>

        <div className="space-y-6">
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
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs font-semibold text-[#045E80]">{taskCode(t.task_number)}</span>{t.title}</p>
                      <p className="truncate text-xs text-slate-500">{t.client?.company_name} · <DueDate date={t.due_date} status={t.status} /></p>
                    </Link>
                    <ClaimButton taskId={t.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canSeeTickets && (
            <Card className="overflow-hidden">
              <CardHeader title="New client tickets" description="Raised from the portal, not yet assigned" />
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
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader title="Due today" />
            <TaskTable tasks={dueTodayTasks} names={names} showAssignee={false} empty={{ title: 'Nothing due today' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Active work" description="In manual progress or in system process" />
            <TaskTable tasks={inProgressTasks} names={names} showAssignee={false} empty={{ title: 'Nothing in progress' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="In review" description="Waiting on your team lead — you can't self-approve" />
            <TaskTable tasks={readyForReviewTasks} names={names} showAssignee={false} empty={{ title: 'Nothing waiting on review' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Completed" description="Most recent first" />
            <TaskTable tasks={myCompletedTasks} names={names} showAssignee={false} empty={{ title: 'Nothing completed yet' }} />
          </Card>
        </div>
      )}

      {isTeamLead && (
        deptMateIds.length === 0 ? (
          <Card className="mt-6">
            <EmptyState icon={<Users className="h-6 w-6" />} title="No department yet" description="Ask a manager to add you to a department to see your team's work here." />
          </Card>
        ) : (
          <div className="mt-6 space-y-6">
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

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <Card className="overflow-hidden">
                <CardHeader title="Team tasks" description="Your department's open work" />
                <TaskTable tasks={teamTasks.slice(0, 10)} names={names} empty={{ title: 'Nothing open on the team' }} />
              </Card>
              <Card className="overflow-hidden">
                <CardHeader title="Pending reviews" description="Submitted for your approval" />
                <TaskTable tasks={pendingReviews} names={names} empty={{ title: 'Nothing waiting on you' }} />
              </Card>
            </div>

          </div>
        )
      )}

      {isManager && (
        <div className="mt-6">
          <DashboardTaskPanel
            workingTasks={workingTasks}
            doneTasks={doneTasks}
            workingCount={workingCount}
            doneCount={doneCount}
            names={names}
          />
        </div>
      )}
    </>
  )
}
