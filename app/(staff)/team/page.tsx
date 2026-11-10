import Link from 'next/link'
import { UserCheck, UserX, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { getStaffLookups, profileIdsReportingTo } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { InviteStaffButton } from '@/components/admin/UserAdmin'
import { Avatar, Card, EmptyState } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { ROLE_LABELS } from '@/lib/constants'
import { capacityColor, capacityTextColor, cn, dueState } from '@/lib/utils'
import type { StaffRole, Task } from '@/types/database'

export const metadata = { title: 'Team' }

const TABS = [
  { key: 'all',      label: 'All', icon: Users },
  { key: 'active',   label: 'Active', icon: UserCheck },
  { key: 'inactive', label: 'Not active', icon: UserX },
] as const

export default async function TeamPage(props: { searchParams: Promise<{ show?: string }> }) {
  const searchParams = await props.searchParams
  const me = await requireRole(['super_admin', 'admin', 'team_lead'])
  const supabase = await createClient()
  const monthStart = new Date();monthStart.setDate(1);monthStart.setHours(0, 0, 0, 0)
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

  // Super Admin sees all staff. Managers and Team Leads see only their reporting hierarchy.
  // Active and not-active people are both listed.
  const reportingIds = profileIdsReportingTo(me.id, lookups)
  const visible = lookups.people.filter(p =>
    me.role === 'super_admin'
      ? p.role !== 'client'
      : p.role !== 'client' && reportingIds.has(p.id))
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
  })

  const counts = { all: everyone.length, active: everyone.filter(m => m.active).length, inactive: everyone.filter(m => !m.active).length }
  const show = TABS.some(t => t.key === searchParams.show) ? searchParams.show as keyof typeof counts : 'all'
  const members = everyone.filter(m => show === 'all' || (show === 'active' ? m.active : !m.active))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="grid h-9 min-w-0 grid-cols-3 gap-px rounded-xl border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]">
          {TABS.map(t => (
            <Link key={t.key} href={t.key === 'all' ? '/team' : `/team?show=${t.key}`}
                  className={cn(
                    'relative flex h-full min-w-0 items-center gap-2 rounded-lg px-3 pr-7 text-xs transition-[background-color,color,box-shadow] duration-200 ease-out',
                    show === t.key
                      ? 'bg-[#034C68] font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
                      : 'bg-white font-medium text-slate-800 hover:bg-slate-50',
                  )}>
              <t.icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', show === t.key ? 'text-white' : 'text-slate-800')} />
              <span className="min-w-0 truncate">{t.label}</span>
              <span className={cn(
                'absolute right-1 top-1/2 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none shadow-sm',
                counts[t.key] > 0 ? 'bg-[#95C12C] text-white' : 'bg-slate-200 text-[#0F172A]',
              )}>
                {counts[t.key] > 99 ? '99+' : counts[t.key]}
              </span>
            </Link>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {['super_admin', 'admin'].includes(me.role) && <ButtonLink href="/admin/users" variant="secondary" size="sm">Manage users & invites</ButtonLink>}
          {me.role !== 'team_lead' && <InviteStaffButton departments={lookups.departments} roles={['employee']} reportingPeople={lookups.people
            .filter(p => p.role !== 'client')
            .map(({ id, full_name, email, avatar_url, role, status }) => ({ id, full_name, email, avatar_url, role: role as StaffRole, status }))} />}
        </div>
      </div>

      {members.length === 0 ? (
        <Card><EmptyState icon={<Users className="h-6 w-6" />} title={show === 'inactive' ? 'Everyone is active' : 'No team members yet'} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {members.map(m => (
            <Link key={m.id} href={`/team/${m.id}`} className="group">
            <Card className={cn('h-full p-5 transition group-hover:[box-shadow:var(--shadow-pop)] group-hover:ring-1 group-hover:ring-[#9FCCDE]', !m.active && 'bg-slate-50 opacity-80')}>
              <div className="flex items-start gap-3">
                <Avatar name={m.full_name || m.email} src={m.avatar_url} role={m.role} className={cn(!m.active && 'grayscale')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 group-hover:text-[#034C68]">
                    {m.full_name || m.email} {m.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                  </p>
                  {m.job_title && <p className="truncate text-xs text-slate-500">{m.job_title}</p>}
                </div>
                {m.active
                  ? <Badge className="bg-[#F5FAE8] text-[#5B771A] ring-[#D3E896]"><span className="h-1.5 w-1.5 rounded-full bg-[#95C12C]" /> Active</Badge>
                  : <Badge className="bg-slate-100 text-slate-500 ring-slate-200"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Not active</Badge>}
              </div>

              <dl className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-lg bg-slate-50 py-2 text-center">
                <div><dt className="text-[11px] text-slate-500">Open</dt><dd className="font-sans text-lg font-bold text-slate-900">{m.open}</dd></div>
                <div><dt className="text-[11px] text-slate-500">Overdue</dt><dd className={cn('font-sans text-lg font-bold', m.overdue ? 'text-red-600' : 'text-slate-900')}>{m.overdue}</dd></div>
                <div><dt className="text-[11px] text-slate-500">Done (month)</dt><dd className="font-sans text-lg font-bold text-[#5B771A]">{m.done}</dd></div>
              </dl>

              {m.active ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-slate-500">Workload {m.hours}h / {m.weekly_capacity_hours}h</span>
                    <span className={cn('font-semibold', capacityTextColor(m.pct))}>{m.pct}%</span>
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
                  {m.depts.map(d => <Badge key={d}>{d}</Badge>)}
                </div>
                <span className="whitespace-nowrap text-xs font-semibold text-[#045E80]">View stats →</span>
              </div>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
