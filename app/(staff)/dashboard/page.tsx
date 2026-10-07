import Link from 'next/link'
import { format } from 'date-fns'
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
import { TicketTable, type TicketListItem } from '@/components/shared/TicketTable'
import { capacityColor, capacityTextColor, cn, dueState, formatRelative, taskCode } from '@/lib/utils'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'Dashboard' }

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default async function DashboardPage() {
  const me = await requireStaff()
  const supabase = createClient()
  const isAdmin = ['super_admin', 'admin'].includes(me.role)
  const isTeamLead = me.role === 'team_lead'
  const isEmployee = me.role === 'employee'

  const [mine, urgent, requests, approvals, people, allWorking, allDone, myCompleted, lookups] = await Promise.all([
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('assignee_id', me.id).not('status', 'in', '(completed,cancelled)')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('is_urgent', true).is('assignee_id', null).not('status', 'in', '(completed,cancelled)')
      .order('priority').order('created_at').limit(5),
    isAdmin
      ? supabase.from('tasks').select(TASK_LIST_SELECT).eq('source', 'client').is('assignee_id', null).not('status', 'in', '(completed,cancelled)')
          .order('created_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
    isAdmin
      ? supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('signup_source', 'self_signup')
      : Promise.resolve({ count: 0 }),
    supabase.from('profiles').select('id, full_name, email'),
    isAdmin
      ? supabase.from('tasks').select(TASK_LIST_SELECT, { count: 'exact' }).not('status', 'in', '(completed,cancelled)')
          .order('is_urgent', { ascending: false })
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(15)
      : Promise.resolve({ data: [], count: 0 }),
    isAdmin
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
  const clientRequests = (requests.data ?? []) as TaskListItem[]
  const names = nameMap(people.data ?? [])
  const dueNow = myTasks.filter(t => ['overdue', 'today'].includes(dueState(t.due_date, t.status))).length
  const workingTasks = (allWorking.data ?? []) as TaskListItem[]
  const doneTasks = (allDone.data ?? []) as TaskListItem[]
  const workingCount = allWorking.count ?? 0
  const doneCount = allDone.count ?? 0

  // Employee branch: pure client-side slices of `myTasks`, plus the one extra "completed" query above.
  const myCompletedTasks = (myCompleted.data ?? []) as TaskListItem[]
  const dueToday = myTasks.filter(t => dueState(t.due_date, t.status) === 'today')
  const inProgressTasks = myTasks.filter(t => t.status === 'in_progress')
  const readyForReviewTasks = myTasks.filter(t => t.status === 'ready_for_review')

  // Team lead branch: department-mates (employees sharing a department with me), explicitly
  // filtered by assignee — RLS's team_lead visibility also includes my own/urgent/client-covered
  // rows, which don't belong in a "my team's work" widget.
  const deptMateIds = isTeamLead && lookups
    ? Array.from(profileIdsSharingDepartment(me.id, lookups)).filter(id => lookups.people.find(p => p.id === id)?.role === 'employee')
    : []

  const [deptTasksRes, deptTicketsRes] = await Promise.all([
    deptMateIds.length
      ? supabase.from('tasks').select(TASK_LIST_SELECT).in('assignee_id', deptMateIds).not('status', 'in', '(completed,cancelled)')
          .order('due_date', { ascending: true, nullsFirst: false }).limit(100)
      : Promise.resolve({ data: [] }),
    deptMateIds.length
      ? supabase.from('tickets').select(TICKET_LIST_SELECT).in('assignee_id', deptMateIds).neq('status', 'closed')
          .order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
  ])

  const teamTasks = (deptTasksRes.data ?? []) as TaskListItem[]
  const pendingReviews = teamTasks.filter(t => t.status === 'ready_for_review')
  const teamTickets = (deptTicketsRes.data ?? []) as TicketListItem[]
  const workload = isTeamLead && lookups
    ? deptMateIds.map(id => {
        const person = lookups.people.find(p => p.id === id)!
        const openTasks = teamTasks.filter(t => t.assignee_id === id)
        const hours = openTasks.reduce((s, t) => s + Number(t.estimated_hours ?? 3), 0)
        return { id, name: person.full_name || person.email, open: openTasks.length, hours,
                 pct: Math.round((hours / (person.weekly_capacity_hours || 40)) * 100) }
      }).sort((a, b) => b.pct - a.pct)
    : []

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-lime-600">{format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="text-2xl font-bold">{greeting()}, {me.full_name.split(' ')[0] || 'there'} 👋</h1>
        </div>
        {!isAdmin && <ButtonLink href="/tasks/new"><Plus className="h-4 w-4" /> New task</ButtonLink>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="My open tasks" value={myTasks.length} icon={CheckSquare} href="/tasks" />
        <StatCard label="Due today / overdue" value={dueNow} icon={AlarmClock} tone={dueNow ? 'red' : 'lime'} href="/tasks" />
        <StatCard label="Urgent waiting" value={urgentTasks.length} icon={Flame} tone={urgentTasks.length ? 'red' : 'lime'} href="/urgent" />
        {isAdmin
          ? <StatCard label="Clients awaiting approval" value={approvals.count ?? 0} icon={ShieldCheck} tone={approvals.count ? 'amber' : 'lime'} href="/admin/approvals" />
          : <StatCard label="New client requests" value={clientRequests.length} icon={Inbox} tone="brand" href="/tasks?scope=all&assignee=none" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader title="My tasks" description="Soonest deadline first" action={<Link href="/tasks" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all</Link>} />
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
              action={<Link href="/urgent" className="text-xs font-semibold text-brand-600">Open</Link>}
            />
            {urgentTasks.length === 0 ? (
              <EmptyState title="Nothing urgent" description="No urgent tasks are waiting." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {urgentTasks.map(t => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 hover:text-brand-700"><span className="mr-1.5 font-mono text-xs text-slate-400">{taskCode(t.task_number)}</span>{t.title}</p>
                      <p className="truncate text-xs text-slate-500">{t.client?.company_name} · <DueDate date={t.due_date} status={t.status} /></p>
                    </Link>
                    <ClaimButton taskId={t.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {isAdmin && (
            <Card className="overflow-hidden">
              <CardHeader title="New client requests" description="Raised from the portal, not yet assigned" />
              {clientRequests.length === 0 ? (
                <EmptyState title="No new requests" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {clientRequests.map(t => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                        <PriorityBadge priority={t.priority} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs text-slate-400">{taskCode(t.task_number)}</span>{t.title}</p>
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
            <TaskTable tasks={dueToday} names={names} showAssignee={false} empty={{ title: 'Nothing due today' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="In progress" />
            <TaskTable tasks={inProgressTasks} names={names} showAssignee={false} empty={{ title: 'Nothing in progress' }} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Ready for review" description="Waiting on your team lead — you can't self-approve" />
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
            <EmptyState icon={Users} title="No department yet" description="Ask an admin to add you to a department to see your team's work here." />
          </Card>
        ) : (
          <div className="mt-6 space-y-6">
            <Card className="overflow-hidden">
              <CardHeader title="My team" action={<Link href="/team" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View team</Link>} />
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                {workload.map(w => (
                  <Link key={w.id} href={`/team/${w.id}`} className="rounded-lg border border-slate-100 p-3 transition hover:shadow-pop">
                    <div className="flex items-center gap-2">
                      <Avatar name={w.name} size="sm" />
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

            <Card className="overflow-hidden">
              <CardHeader title="Team tickets" description="Raised against your department" />
              <TicketTable tickets={teamTickets} showClient hrefBase="/tickets" empty={{ title: 'No open tickets for your team' }} />
            </Card>
          </div>
        )
      )}

      {isAdmin && (
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
