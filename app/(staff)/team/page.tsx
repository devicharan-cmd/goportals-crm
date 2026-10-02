import Link from 'next/link'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { getStaffLookups } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { InviteStaffButton } from '@/components/admin/UserAdmin'
import { Avatar, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { ROLE_LABELS } from '@/lib/constants'
import { capacityColor, cn, dueState } from '@/lib/utils'
import type { Task } from '@/types/database'

export const metadata = { title: 'Team' }

const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'inactive', label: 'Not active' },
] as const

export default async function TeamPage({ searchParams }: { searchParams: { show?: string } }) {
  const me = await requireRole(['super_admin', 'admin', 'team_lead'])
  const supabase = createClient()
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const [lookups, { data }, { data: doneData }] = await Promise.all([
    getStaffLookups(),
    supabase.from('tasks').select('assignee_id, estimated_hours, status, due_date').not('status', 'in', '(completed,cancelled)').not('assignee_id', 'is', null),
    supabase.from('tasks').select('assignee_id').eq('status', 'completed').gte('closed_at', monthStart.toISOString()).not('assignee_id', 'is', null),
  ])
  const tasks = (data ?? []) as Pick<Task, 'assignee_id' | 'estimated_hours' | 'status' | 'due_date'>[]
  const doneThisMonth = (doneData ?? []).reduce<Record<string, number>>((acc, t: { assignee_id: string }) => {
    acc[t.assignee_id] = (acc[t.assignee_id] ?? 0) + 1
    return acc
  }, {})
  const deptName = Object.fromEntries(lookups.departments.map(d => [d.id, d.name]))

  // Super admin / admin: all staff, company-wide. Team lead: only employees sharing a department with them.
  // Active and not-active people are both listed.
  const myDepartmentIds = new Set(lookups.departmentMembers.filter(m => m.profile_id === me.id).map(m => m.department_id))
  const sharesMyDepartment = (profileId: string) =>
    lookups.departmentMembers.some(m => m.profile_id === profileId && myDepartmentIds.has(m.department_id))
  const visible = lookups.people.filter(p =>
    ['super_admin', 'admin'].includes(me.role) ? p.role !== 'client'
      : p.role === 'employee' && sharesMyDepartment(p.id))
  const everyone = visible.map(p => {
    const mine = tasks.filter(t => t.assignee_id === p.id)
    const hours = mine.reduce((s, t) => s + Number(t.estimated_hours ?? 3), 0)
    return {
      ...p,
      active: p.status === 'active',
      open: mine.length,
      done: doneThisMonth[p.id] ?? 0,
      overdue: mine.filter(t => dueState(t.due_date, t.status) === 'overdue').length,
      hours,
      pct: Math.round((hours / (p.weekly_capacity_hours || 40)) * 100),
      depts: lookups.departmentMembers.filter(m => m.profile_id === p.id).map(m => deptName[m.department_id]).filter(Boolean),
    }
  }).sort((a, b) => Number(b.active) - Number(a.active) || b.pct - a.pct || (a.full_name || a.email).localeCompare(b.full_name || b.email))

  const counts = { all: everyone.length, active: everyone.filter(m => m.active).length, inactive: everyone.filter(m => !m.active).length }
  const show = TABS.some(t => t.key === searchParams.show) ? searchParams.show as keyof typeof counts : 'all'
  const members = everyone.filter(m => show === 'all' || (show === 'active' ? m.active : !m.active))

  return (
    <>
      <PageHeader
        title="Team"
        description={`${['super_admin', 'admin'].includes(me.role) ? 'All team members' : 'Your department\'s employees'}. Workload = estimated hours of unfinished tasks vs weekly capacity.`}
        actions={
          <>
            {['super_admin', 'admin'].includes(me.role) && <ButtonLink href="/admin/users" variant="secondary">Manage users & invites</ButtonLink>}
            {me.role !== 'team_lead' && <InviteStaffButton departments={lookups.departments} roles={['employee']} />}
          </>
        }
      />

      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm">
        {TABS.map(t => (
          <Link key={t.key} href={t.key === 'all' ? '/team' : `/team?show=${t.key}`}
                className={cn('rounded-md px-3 py-1 font-medium', show === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
            {t.label} <span className="ml-1 text-xs text-slate-400">{counts[t.key]}</span>
          </Link>
        ))}
      </div>

      {members.length === 0 ? (
        <Card><EmptyState icon={Users} title={show === 'inactive' ? 'Everyone is active' : 'No team members yet'} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {members.map(m => (
            <Link key={m.id} href={`/team/${m.id}`} className="group">
            <Card className={cn('h-full p-5 transition group-hover:shadow-pop group-hover:ring-1 group-hover:ring-brand-200', !m.active && 'bg-slate-50 opacity-80')}>
              <div className="flex items-start gap-3">
                <Avatar name={m.full_name || m.email} className={cn(!m.active && 'grayscale')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 group-hover:text-brand-700">
                    {m.full_name || m.email} {m.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.job_title || ROLE_LABELS[m.role]}</p>
                </div>
                {m.active
                  ? <Badge className="bg-lime-50 text-lime-700 ring-lime-200"><span className="h-1.5 w-1.5 rounded-full bg-lime-500" /> Active</Badge>
                  : <Badge className="bg-slate-100 text-slate-500 ring-slate-200"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Not active</Badge>}
              </div>

              <dl className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-lg bg-slate-50 py-2 text-center">
                <div><dt className="text-[11px] text-slate-500">Open</dt><dd className="font-display text-lg font-bold text-slate-900">{m.open}</dd></div>
                <div><dt className="text-[11px] text-slate-500">Overdue</dt><dd className={cn('font-display text-lg font-bold', m.overdue ? 'text-red-600' : 'text-slate-900')}>{m.overdue}</dd></div>
                <div><dt className="text-[11px] text-slate-500">Done (month)</dt><dd className="font-display text-lg font-bold text-lime-700">{m.done}</dd></div>
              </dl>

              {m.active ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-slate-500">Workload {m.hours}h / {m.weekly_capacity_hours}h</span>
                    <span className={cn('font-semibold', m.pct >= 100 ? 'text-red-600' : m.pct >= 80 ? 'text-amber-600' : 'text-slate-700')}>{m.pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn('h-full rounded-full', capacityColor(m.pct))} style={{ width: `${Math.min(100, m.pct)}%` }} />
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-400">Can&apos;t sign in or be assigned new tasks.</p>
              )}

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1">
                  <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{ROLE_LABELS[m.role]}</Badge>
                  {m.depts.map(d => <Badge key={d}>{d}</Badge>)}
                </div>
                <span className="whitespace-nowrap text-xs font-semibold text-brand-600">View stats →</span>
              </div>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
