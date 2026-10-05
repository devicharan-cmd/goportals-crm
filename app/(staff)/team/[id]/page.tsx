import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { addWeeks, differenceInHours, format, startOfMonth, startOfWeek } from 'date-fns'
import { AlarmClock, ArrowLeft, CheckCircle2, Clock, Gauge, ListTodo, Mail, Plus, Target, Timer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assigneeOptionsFor, getStaffLookups, nameMap, TASK_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Avatar, Card, CardHeader, StatCard } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { TaskTable } from '@/components/tasks/TaskTable'
import { WeeklyDoneChart, type WeekBucket } from '@/components/team/WeeklyDoneChart'
import { ROLE_LABELS, TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_TERMINAL_STATUSES } from '@/lib/constants'
import { capacityColor, cn, dueState } from '@/lib/utils'
import type { Profile, TaskListItem, TaskStatus } from '@/types/database'

export const metadata = { title: 'Employee stats' }

export default async function EmployeeStatsPage({ params }: { params: { id: string } }) {
  const me = await requireRole(['super_admin', 'admin', 'team_lead'])
  const supabase = createClient()

  const [{ data: personData }, { data: taskData }, { data: logData }, lookups] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('assignee_id', params.id).order('updated_at', { ascending: false }).limit(1000),
    supabase.from('time_logs').select('hours, logged_date').eq('profile_id', params.id).gte('logged_date', format(startOfMonth(new Date()), 'yyyy-MM-dd')),
    getStaffLookups(),
  ])
  if (!personData) notFound()
  const person = personData as Profile
  if (person.role === 'client') notFound()
  // Team leads only look at employees in a department they share, or themselves.
  if (me.role === 'team_lead') {
    const myDepartmentIds = new Set(lookups.departmentMembers.filter(m => m.profile_id === me.id).map(m => m.department_id))
    const shared = lookups.departmentMembers.some(m => m.profile_id === person.id && myDepartmentIds.has(m.department_id))
    if (person.id !== me.id && (person.role !== 'employee' || !shared)) redirect('/team')
  }

  const tasks = (taskData ?? []) as TaskListItem[]
  const names = nameMap(lookups.people)
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)

  const open = tasks.filter(t => !TASK_TERMINAL_STATUSES.includes(t.status))
  const done = tasks.filter(t => t.status === 'completed' && t.closed_at)
  const overdue = open.filter(t => dueState(t.due_date, t.status) === 'overdue')
  const doneWeek = done.filter(t => new Date(t.closed_at!) >= weekStart)
  const doneMonth = done.filter(t => new Date(t.closed_at!) >= monthStart)
  const withDue = done.filter(t => t.due_date)
  const onTime = withDue.filter(t => t.closed_at!.slice(0, 10) <= t.due_date!)
  const onTimePct = withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null
  const durations = done.filter(t => t.assigned_at).map(t => differenceInHours(new Date(t.closed_at!), new Date(t.assigned_at!)))
  const avgDays = durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length / 24) * 10) / 10 : null
  const hoursMonth = Math.round((logData ?? []).reduce((s, l: { hours: number }) => s + Number(l.hours), 0) * 10) / 10
  const openHours = open.reduce((s, t) => s + Number(t.estimated_hours ?? 3), 0)
  const workload = Math.round((openHours / (person.weekly_capacity_hours || 40)) * 100)

  const byStatus = (['todo', 'in_progress', 'ready_for_review', 'changes_requested'] as TaskStatus[]).map(s => ({ s, n: open.filter(t => t.status === s).length }))

  // Completed per week, last 8 weeks (Mon–Sun)
  const weeks: WeekBucket[] = Array.from({ length: 8 }, (_, i) => {
    const start = addWeeks(weekStart, i - 7)
    const end = addWeeks(start, 1)
    return {
      label: format(start, 'd MMM'),
      range: `${format(start, 'd MMM')} – ${format(addWeeks(start, 1).getTime() - 86400000, 'd MMM')}`,
      count: done.filter(t => { const c = new Date(t.closed_at!); return c >= start && c < end }).length,
    }
  })

  const deptName = Object.fromEntries(lookups.departments.map(d => [d.id, d.name]))
  const depts = lookups.departmentMembers.filter(m => m.profile_id === person.id).map(m => deptName[m.department_id]).filter(Boolean)
  const active = person.status === 'active'

  return (
    <>
      <Link href="/team" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Team</Link>

      {/* Header */}
      <Card className="mb-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={person.full_name || person.email} size="lg" className={cn(!active && 'grayscale')} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{person.full_name || person.email}</h1>
              {active
                ? <Badge className="bg-lime-50 text-lime-700 ring-lime-200"><span className="h-1.5 w-1.5 rounded-full bg-lime-500" /> Active</Badge>
                : <Badge className="bg-slate-100 text-slate-500 ring-slate-200"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Not active</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{person.job_title || ROLE_LABELS[person.role]}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{ROLE_LABELS[person.role]}</Badge>
              {depts.map(d => <Badge key={d}>{d}</Badge>)}
              <a href={`mailto:${person.email}`} className="ml-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700"><Mail className="h-3.5 w-3.5" />{person.email}</a>
            </div>
          </div>
          {active && (
            <ButtonLink href={`/tasks/new?assignee=${person.id}`}><Plus className="h-4 w-4" /> Assign new task</ButtonLink>
          )}
        </div>
      </Card>

      {/* Headline stats */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Working on now" value={open.length} icon={ListTodo} />
        <StatCard label="Overdue" value={overdue.length} icon={AlarmClock} tone={overdue.length ? 'red' : 'lime'} />
        <StatCard label="Completed this month" value={doneMonth.length} icon={CheckCircle2} tone="lime" hint={`${doneWeek.length} this week · ${done.length} all time`} />
        <StatCard label="Completed on time" value={onTimePct == null ? '—' : `${onTimePct}%`} icon={Target} tone={onTimePct == null || onTimePct >= 80 ? 'lime' : onTimePct >= 60 ? 'amber' : 'red'}
                  hint={withDue.length ? `${onTime.length} of ${withDue.length} with a due date` : 'No due dates yet'} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Avg. time to complete" value={avgDays == null ? '—' : `${avgDays}d`} icon={Timer} tone="brand" hint="From assigned to done" />
        <StatCard label="Hours logged this month" value={`${hoursMonth}h`} icon={Clock} tone="amber" />
        <div className="card col-span-2 p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><Gauge className="h-4 w-4 text-slate-400" /> Workload (open estimated hours vs weekly capacity)</p>
            <span className={cn('text-sm font-bold', workload >= 100 ? 'text-red-600' : workload >= 80 ? 'text-amber-600' : 'text-slate-800')}>{workload}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cn('h-full rounded-full', capacityColor(workload))} style={{ width: `${Math.min(100, workload)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{openHours}h of {person.weekly_capacity_hours}h</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {byStatus.map(({ s, n }) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <span className={cn('h-2 w-2 rounded-full', TASK_STATUS_DOT[s])} /> {TASK_STATUS_LABELS[s]} <span className="font-semibold text-slate-900">{n}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title={`Working on now (${open.length})`} description="Soonest deadline first" />
            <TaskTable
              tasks={[...open].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))}
              names={names}
              showAssignee={false}
              assignOptions={assigneeOptionsFor(me, lookups)}
              empty={{ title: 'Nothing open', description: active ? 'Assign a task to get them started.' : undefined }}
            />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Recently completed" description={`${done.length} completed in total`} />
            <TaskTable tasks={[...done].sort((a, b) => b.closed_at!.localeCompare(a.closed_at!)).slice(0, 15)} names={names} showAssignee={false}
                       empty={{ title: 'Nothing completed yet' }} />
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Tasks completed per week" description="Last 8 weeks" />
          <div className="p-5 pt-8"><WeeklyDoneChart weeks={weeks} /></div>
        </Card>
      </div>
    </>
  )
}
