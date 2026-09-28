import Link from 'next/link'
import { format } from 'date-fns'
import { AlarmClock, CheckSquare, Flame, Inbox, Plus, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { nameMap, TASK_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, StatCard } from '@/components/ui/primitives'
import { DueDate, PriorityBadge } from '@/components/ui/badges'
import { TaskTable } from '@/components/tasks/TaskTable'
import { ClaimButton } from '@/components/tasks/ClaimButton'
import { dueState, formatRelative, taskCode } from '@/lib/utils'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'Dashboard' }

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default async function DashboardPage() {
  const me = await requireStaff()
  const supabase = createClient()
  const isLead = me.role !== 'employee'

  const [mine, urgent, requests, approvals, people] = await Promise.all([
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('assignee_id', me.id).neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('is_urgent', true).is('assignee_id', null).neq('status', 'done')
      .order('priority').order('created_at').limit(5),
    isLead
      ? supabase.from('tasks').select(TASK_LIST_SELECT).eq('source', 'client').is('assignee_id', null).neq('status', 'done')
          .order('created_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
    me.role === 'super_admin'
      ? supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('signup_source', 'self_signup')
      : Promise.resolve({ count: 0 }),
    supabase.from('profiles').select('id, full_name, email'),
  ])

  const myTasks = (mine.data ?? []) as TaskListItem[]
  const urgentTasks = (urgent.data ?? []) as TaskListItem[]
  const clientRequests = (requests.data ?? []) as TaskListItem[]
  const names = nameMap(people.data ?? [])
  const dueNow = myTasks.filter(t => ['overdue', 'today'].includes(dueState(t.due_date, t.status))).length

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-lime-600">{format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="text-2xl font-bold">{greeting()}, {me.full_name.split(' ')[0] || 'there'} 👋</h1>
        </div>
        {me.role !== 'super_admin' && <ButtonLink href="/tasks/new"><Plus className="h-4 w-4" /> New task</ButtonLink>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="My open tasks" value={myTasks.length} icon={CheckSquare} href="/tasks" />
        <StatCard label="Due today / overdue" value={dueNow} icon={AlarmClock} tone={dueNow ? 'red' : 'lime'} href="/tasks" />
        <StatCard label="Urgent waiting" value={urgentTasks.length} icon={Flame} tone={urgentTasks.length ? 'red' : 'lime'} href="/urgent" />
        {me.role === 'super_admin'
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

          {isLead && (
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
    </>
  )
}
