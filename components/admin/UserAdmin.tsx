'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Alert, Avatar, Field } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { ROLE_LABELS } from '@/lib/constants'
import { cn, errorMessage, formatRelative } from '@/lib/utils'
import type { AccountStatus, AppRole, Department, Invite, StaffRole } from '@/types/database'

export type StaffRow = {
  id: string; full_name: string; email: string; role: StaffRole; status: AccountStatus
  job_title: string | null; weekly_capacity_hours: number; departmentIds: string[]
}

async function postInvite(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  return res.ok ? null : (data.error as string)
}

// ─── One staff member, inline editable ───────────────────────
export function StaffRowEditor({ row, departments, isMe, actorRole }: {
  row: StaffRow; departments: Department[]; isMe: boolean; actorRole: AppRole
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const supabase = createClient()
  // Role/status/job title/capacity changes are super-admin-only in the DB (guard_profile_update) —
  // an admin actor can only manage department membership here, not these fields.
  const canEditProfile = actorRole === 'super_admin'
  const canEditDepartments = actorRole === 'super_admin' || actorRole === 'admin'

  async function update(fields: Record<string, unknown>) {
    setBusy(true); setError('')
    const { error } = await supabase.from('profiles').update(fields).eq('id', row.id)
    setBusy(false)
    if (error) setError(errorMessage(error))
    router.refresh()
  }

  async function toggleDept(deptId: string) {
    setBusy(true); setError('')
    const { error } = row.departmentIds.includes(deptId)
      ? await supabase.from('department_members').delete().eq('department_id', deptId).eq('profile_id', row.id)
      : await supabase.from('department_members').insert({ department_id: deptId, profile_id: row.id })
    setBusy(false)
    if (error) setError(errorMessage(error))
    router.refresh()
  }

  return (
    <li className={cn('px-5 py-4', row.status !== 'active' && 'bg-slate-50/70 opacity-75')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={row.full_name || row.email} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{row.full_name || '—'} {isMe && <span className="text-xs font-normal text-slate-400">(you)</span>}</p>
            <p className="truncate text-xs text-slate-500">{row.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input defaultValue={row.job_title ?? ''} placeholder="Job title (e.g. Team Lead)" disabled={busy || !canEditProfile}
                 onBlur={e => e.target.value !== (row.job_title ?? '') && update({ job_title: e.target.value || null })}
                 className="input h-8 w-44 py-1 text-xs" />
          {canEditProfile ? (
            <select value={row.role} disabled={busy || isMe} onChange={e => update({ role: e.target.value })} className="input h-8 w-auto py-1 text-xs">
              {(['super_admin', 'admin', 'team_lead', 'employee'] as StaffRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          ) : (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{ROLE_LABELS[row.role]}</span>
          )}
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="number" min="1" max="80" defaultValue={row.weekly_capacity_hours} disabled={busy || !canEditProfile}
                   onBlur={e => Number(e.target.value) !== row.weekly_capacity_hours && update({ weekly_capacity_hours: Number(e.target.value) || 40 })}
                   className="input h-8 w-16 py-1 text-xs" /> h/wk
          </label>
          {canEditProfile ? (
            <select value={row.status} disabled={busy || isMe} onChange={e => update({ status: e.target.value })}
                    className={cn('input h-8 w-auto py-1 text-xs', row.status !== 'active' && 'text-red-700')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          ) : (
            <span className={cn('rounded-md bg-slate-100 px-2 py-1 text-xs font-medium', row.status !== 'active' ? 'text-red-700' : 'text-slate-600')}>
              {row.status === 'active' ? 'Active' : 'Suspended'}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 lg:pl-12">
        {departments.map(d => {
          const on = row.departmentIds.includes(d.id)
          return (
            <button key={d.id} disabled={busy || !canEditDepartments} onClick={() => toggleDept(d.id)}
                    className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition',
                      on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300')}>
              {d.name}
            </button>
          )
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 lg:pl-12">{error}</p>}
    </li>
  )
}

// ─── Invite staff ────────────────────────────────────────────
export function InviteStaffButton({
  departments, roles = ['employee', 'team_lead', 'admin', 'super_admin'],
}: { departments: Department[]; roles?: StaffRole[] }) {
  const onlyEmployees = roles.length === 1 && roles[0] === 'employee'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const empty = { full_name: '', email: '', role: 'employee' as StaffRole, job_title: '', department_ids: [] as string[] }
  const [form, setForm] = useState(empty)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const err = await postInvite({ kind: 'staff', ...form })
    setBusy(false)
    if (err) return setMsg({ ok: false, text: err })
    setMsg({ ok: true, text: `Invite sent to ${form.email}.` })
    setForm(empty)
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => { setOpen(true); setMsg(null) }}><UserPlus className="h-4 w-4" /> {onlyEmployees ? 'Add employee' : 'Invite team member'}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={onlyEmployees ? 'Add an employee' : 'Invite a team member'} description="They'll get an email to set their password.">
        <form onSubmit={submit} className="space-y-4">
          {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
          <Field label="Full name" required><input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Email" required><input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" required>
              <select className="input" value={form.role} disabled={onlyEmployees} onChange={e => setForm({ ...form, role: e.target.value as StaffRole })}>
                {roles.includes('employee') && <option value="employee">Employee</option>}
                {roles.includes('team_lead') && <option value="team_lead">Team Lead</option>}
                {roles.includes('admin') && <option value="admin">Admin</option>}
                {roles.includes('super_admin') && <option value="super_admin">Super Admin</option>}
              </select>
            </Field>
            <Field label="Job title"><input className="input" placeholder="e.g. Ads Executive" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} /></Field>
          </div>
          <Field label="Departments" hint="Team Leads see the tasks and tickets of their departments.">
            <div className="flex flex-wrap gap-1.5">
              {departments.map(d => {
                const on = form.department_ids.includes(d.id)
                return (
                  <button type="button" key={d.id}
                          onClick={() => setForm({ ...form, department_ids: on ? form.department_ids.filter(x => x !== d.id) : [...form.department_ids, d.id] })}
                          className={cn('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                            on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300')}>
                    {d.name}
                  </button>
                )
              })}
            </div>
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" loading={busy}>Send invite</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

// ─── Add a user: one process for everyone, client or staff ───
// Same modal, same "set a password by email" mechanics either way — only the
// fields shown differ, because a client and a staff member genuinely need
// different data (role/department vs nothing), not because the process differs.
export function InviteUserButton({ departments, actorRole }: { departments: Department[]; actorRole: AppRole }) {
  const staffRoleOptions: { value: StaffRole; label: string }[] = actorRole === 'super_admin'
    ? [{ value: 'employee', label: 'Employee' }, { value: 'team_lead', label: 'Team Lead' },
       { value: 'admin', label: 'Admin' }, { value: 'super_admin', label: 'Super Admin' }]
    : [{ value: 'employee', label: 'Employee' }, { value: 'team_lead', label: 'Team Lead' }]
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const empty = { kind: 'client' as 'client' | 'staff', full_name: '', email: '', role: 'employee' as StaffRole, job_title: '', department_ids: [] as string[] }
  const [form, setForm] = useState(empty)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const body = form.kind === 'client'
      ? { kind: 'client', full_name: form.full_name, email: form.email }
      : { kind: 'staff', full_name: form.full_name, email: form.email, role: form.role, job_title: form.job_title, department_ids: form.department_ids }
    const err = await postInvite(body)
    setBusy(false)
    if (err) return setMsg({ ok: false, text: err })
    setMsg({ ok: true, text: `Invite sent to ${form.email}.` })
    setForm(empty)
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => { setOpen(true); setMsg(null) }}><UserPlus className="h-4 w-4" /> Add user</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a user"
             description="Same process either way: they get an email to set a password, then land in the right place for their role.">
        <form onSubmit={submit} className="space-y-4">
          {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}

          <Field label="Type" required>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
              {([['client', 'Client'], ['staff', 'Team member']] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setForm({ ...form, kind: v })}
                        className={cn('rounded-md px-3 py-1.5 font-medium transition', form.kind === v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                  {l}
                </button>
              ))}
            </div>
          </Field>

          <Field label={form.kind === 'client' ? 'Contact name' : 'Full name'} required={form.kind === 'staff'}>
            <input className="input" required={form.kind === 'staff'} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Email" required><input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>

          {form.kind === 'staff' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role" required>
                  <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as StaffRole })}>
                    {staffRoleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Job title"><input className="input" placeholder="e.g. Ads Executive" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} /></Field>
              </div>
              <Field label="Departments" hint="Team Leads see the tasks and tickets of their departments.">
                <div className="flex flex-wrap gap-1.5">
                  {departments.map(d => {
                    const on = form.department_ids.includes(d.id)
                    return (
                      <button type="button" key={d.id}
                              onClick={() => setForm({ ...form, department_ids: on ? form.department_ids.filter(x => x !== d.id) : [...form.department_ids, d.id] })}
                              className={cn('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                                on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300')}>
                        {d.name}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              They&apos;ll set a password, fill in their company details and address, and accept the agreement — no approval step needed.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" loading={busy}><Mail className="h-4 w-4" /> Send invite</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

// ─── Pending invites ─────────────────────────────────────────
export function PendingInvites({ invites }: { invites: Invite[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  async function cancel(id: string) {
    setBusy(id)
    await fetch('/api/admin/invite', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setBusy(null)
    router.refresh()
  }
  if (invites.length === 0) return <p className="px-5 py-4 text-sm text-slate-400">No pending invites.</p>
  return (
    <ul className="divide-y divide-slate-100">
      {invites.map(i => {
        const expired = new Date(i.expires_at) < new Date()
        return (
          <li key={i.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{i.full_name || i.email}</p>
              <p className="truncate text-xs text-slate-500" suppressHydrationWarning>{i.email} · sent {formatRelative(i.created_at)}</p>
            </div>
            <Badge>{ROLE_LABELS[i.role]}</Badge>
            {expired && <Badge className="bg-red-50 text-red-700 ring-red-200">Expired</Badge>}
            <button onClick={() => cancel(i.id)} disabled={busy === i.id} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Cancel invite">
              <X className="h-4 w-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
