'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Mail, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Alert, Avatar, Field } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { ROLE_LABELS, ROLE_STYLES } from '@/lib/constants'
import { cn, errorMessage, formatRelative } from '@/lib/utils'
import type { AccountStatus, AppRole, Department, Invite, StaffRole } from '@/types/database'

export type StaffRow = {
  id: string; full_name: string; email: string; role: StaffRole; status: AccountStatus
  job_title: string | null; weekly_capacity_hours: number; departmentIds: string[]
}

export type UnlinkedClientAccount = { id: string; email: string; full_name: string }

export function UnlinkedClientAccounts({ accounts }: { accounts: UnlinkedClientAccount[] }) {
  if (!accounts.length) return null
  return (
    <CardAccountList accounts={accounts} />
  )
}

function CardAccountList({ accounts }: { accounts: UnlinkedClientAccount[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {accounts.map(account => (
        <UnlinkedClientAccountRow key={account.id} account={account} />
      ))}
    </ul>
  )
}

function UnlinkedClientAccountRow({ account }: { account: UnlinkedClientAccount }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(account.id)}`, { method: 'DELETE' })
      const result = await response.json() as { error?: unknown; email?: string }
      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : 'Could not delete the account.'
        setError(message)
        toast.error(message)
        return
      }
      toast.success(`Account and related personal data for ${result.email ?? account.email} deleted.`)
      setOpen(false)
      router.refresh()
    } catch (requestError) {
      const message = errorMessage(requestError)
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{account.full_name || account.email}</p>
        <p className="truncate text-xs text-slate-500">{account.email}</p>
      </div>
      <Button variant="danger" size="sm" onClick={() => { setError(''); setOpen(true) }}>
        <Trash2 className="h-3.5 w-3.5" /> Delete account
      </Button>
      <Modal
        open={open}
        onClose={() => { if (!busy) setOpen(false) }}
        title="Delete unlinked client account?"
        description={`Permanently delete the login for ${account.email}, its profile, uploaded files, comments, activity, time logs, notifications, and invites. Existing tasks and tickets will remain, with this account removed from their user references.`}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" loading={busy} onClick={remove}>Delete account and data</Button>
        </div>
      </Modal>
    </li>
  )
}

function emptyInviteUserForm() {
  return { kind: 'client' as 'client' | 'staff', full_name: '', email: '', role: '' as StaffRole | '', job_title: '', department_ids: [] as string[] }
}

type StaffInviteErrors = Partial<Record<'full_name' | 'email' | 'role' | 'job_title', string>>
type StaffInviteField = keyof StaffInviteErrors
type StaffInviteValues = { full_name: string; email: string; role: StaffRole | ''; job_title: string }

function validateStaffInviteField(field: StaffInviteField, value: string | StaffRole) {
  const trimmedValue = value.trim()
  if (field === 'full_name' && !trimmedValue) return 'Enter the team member’s full name.'
  if (field === 'email') {
    if (!trimmedValue) return 'Enter an email address.'
    if (!/^\S+@\S+\.\S+$/.test(trimmedValue)) return 'Enter a valid email address.'
  }
  if (field === 'role' && !value) return 'Select a role.'
  if (field === 'job_title' && !trimmedValue) return 'Enter a job title.'
  return undefined
}

function validateStaffInvite(form: StaffInviteValues): StaffInviteErrors {
  const fields: StaffInviteField[] = ['full_name', 'email', 'role', 'job_title']
  return Object.fromEntries(fields.flatMap(field => {
    const error = validateStaffInviteField(field, form[field])
    return error ? [[field, error]] : []
  }))
}

function inviteInputClass(invalid: boolean) {
  return cn(
    'input focus:outline-none focus:ring-0 focus:shadow-none',
    invalid ? 'border-red-500 focus:border-red-500' : 'focus:border-brand-600',
  )
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
  // full_name is the one field the DB lets anyone change on their own row.
  const canEditName = canEditProfile || isMe

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
          <Avatar name={row.full_name || row.email} role={row.role} />
          <div className="min-w-0 flex-1">
            {/* Everyone may fix their own name; a super admin may fix anyone's.
                Without this, accounts invited without one show as a raw email
                across the team list, assignee pickers and activity trails. */}
            <div className="flex items-center gap-2">
              <input defaultValue={row.full_name ?? ''} placeholder="Full name" disabled={busy} readOnly={!canEditName}
                     aria-label={`Full name for ${row.full_name || row.email}`}
                     onBlur={e => canEditName && e.target.value.trim() !== (row.full_name ?? '') && update({ full_name: e.target.value.trim() })}
                     spellCheck={false} autoCorrect="off" className="input h-8 w-full max-w-56 py-1 text-sm font-semibold read-only:cursor-default" />
              {isMe && <span className="text-xs text-slate-400">(you)</span>}
            </div>
            <p className="truncate text-xs text-slate-500">{row.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input defaultValue={row.job_title ?? ''} placeholder="Job title (e.g. Team Lead)" disabled={busy || !canEditProfile}
                 onBlur={e => e.target.value !== (row.job_title ?? '') && update({ job_title: e.target.value || null })}
                 spellCheck={false} autoCorrect="off" className="input h-8 w-44 py-1 text-xs" />
          {canEditProfile ? (
            <select value={row.role} disabled={busy || isMe} onChange={e => update({ role: e.target.value })} className="input h-8 w-auto py-1 text-xs">
              {(['super_admin', 'admin', 'team_lead', 'employee'] as StaffRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          ) : (
            <span className={cn('rounded-md border bg-white px-2 py-1 text-xs font-medium transition-colors', ROLE_STYLES[row.role].badge)}>{ROLE_LABELS[row.role]}</span>
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
  const [errors, setErrors] = useState<StaffInviteErrors>({})
  const [touched, setTouched] = useState<Partial<Record<StaffInviteField, boolean>>>({})
  const empty = { full_name: '', email: '', role: onlyEmployees ? 'employee' as StaffRole : '' as StaffRole | '', job_title: '', department_ids: [] as string[] }
  const [form, setForm] = useState(empty)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const validationErrors = validateStaffInvite(form)
    setTouched({ full_name: true, email: true, role: true, job_title: true })
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return
    setBusy(true); setMsg(null)
    const err = await postInvite({ kind: 'staff', ...form, full_name: form.full_name.trim(), email: form.email.trim(), job_title: form.job_title.trim() })
    setBusy(false)
    if (err) return setMsg({ ok: false, text: err })
    setMsg({ ok: true, text: `Invite sent to ${form.email}.` })
    setForm(empty)
    setErrors({})
    setTouched({})
    router.refresh()
  }

  return (
    <>
      <Button size="sm" onClick={() => { setOpen(true); setMsg(null); setErrors({}); setTouched({}) }}><UserPlus className="h-3.5 w-3.5" /> {onlyEmployees ? 'Add employee' : 'Invite team member'}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={onlyEmployees ? 'Add an employee' : 'Invite a team member'} description="They'll get an email to set their password.">
        <form onSubmit={submit} className="space-y-4" noValidate spellCheck={false}>
          {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
          <Field label="Full name" required error={errors.full_name} errorId="staff-invite-name-error">
            <input className={inviteInputClass(!!errors.full_name)} aria-invalid={!!errors.full_name} aria-describedby={errors.full_name ? 'staff-invite-name-error' : undefined} value={form.full_name}
                   onChange={e => {
                     const value = e.currentTarget.value
                     setForm(current => ({ ...current, full_name: value }))
                     setErrors(current => ({ ...current, full_name: touched.full_name ? validateStaffInviteField('full_name', value) : undefined }))
                   }}
                   spellCheck={false} autoCorrect="off" autoCapitalize="words" />
          </Field>
          <Field label="Email" required error={errors.email} errorId="staff-invite-email-error">
            <input className={inviteInputClass(!!errors.email)} type="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'staff-invite-email-error' : undefined} value={form.email}
                   onChange={e => {
                     const value = e.currentTarget.value
                     setForm(current => ({ ...current, email: value }))
                     setErrors(current => ({ ...current, email: touched.email ? validateStaffInviteField('email', value) : undefined }))
                   }}
                   />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" required error={errors.role} errorId="staff-invite-role-error">
              <select className={inviteInputClass(!!errors.role)} aria-invalid={!!errors.role} aria-describedby={errors.role ? 'staff-invite-role-error' : undefined} value={form.role || ''} disabled={onlyEmployees}
                      onChange={e => {
                        const value = e.currentTarget.value as StaffRole | ''
                        setForm(current => ({ ...current, role: value }))
                        setErrors(current => ({ ...current, role: touched.role ? validateStaffInviteField('role', value) : undefined }))
                      }}
                      >
                {!onlyEmployees && <option value="">Select role</option>}
                {roles.includes('employee') && <option value="employee">Employee</option>}
                {roles.includes('team_lead') && <option value="team_lead">Team Lead</option>}
                {roles.includes('admin') && <option value="admin">Manager</option>}
                {roles.includes('super_admin') && <option value="super_admin">Super Admin</option>}
              </select>
            </Field>
            <Field label="Job title" required error={errors.job_title} errorId="staff-invite-title-error">
              <input className={inviteInputClass(!!errors.job_title)} aria-invalid={!!errors.job_title} aria-describedby={errors.job_title ? 'staff-invite-title-error' : undefined} value={form.job_title}
                     onChange={e => {
                       const value = e.currentTarget.value
                       setForm(current => ({ ...current, job_title: value }))
                       setErrors(current => ({ ...current, job_title: touched.job_title ? validateStaffInviteField('job_title', value) : undefined }))
                     }}
                     placeholder="e.g. Ads Executive" spellCheck={false} autoCorrect="off" />
            </Field>
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
       { value: 'admin', label: 'Manager' }, { value: 'super_admin', label: 'Super Admin' }]
    : [{ value: 'employee', label: 'Employee' }, { value: 'team_lead', label: 'Team Lead' }]
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [errors, setErrors] = useState<StaffInviteErrors>({})
  const [touched, setTouched] = useState<Partial<Record<StaffInviteField, boolean>>>({})
  const [form, setForm] = useState(emptyInviteUserForm)

  function closeModal() {
    setOpen(false)
    setForm(emptyInviteUserForm())
    setMsg(null)
    setErrors({})
    setTouched({})
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(form.kind === 'staff'
      ? { full_name: true, email: true, role: true, job_title: true }
      : { email: true })
    if (form.kind === 'staff') {
      const validationErrors = validateStaffInvite(form)
      setErrors(validationErrors)
      if (Object.keys(validationErrors).length) return
    } else {
      const emailError = validateStaffInviteField('email', form.email)
      setErrors(emailError ? { email: emailError } : {})
      if (emailError) return
    }
    setBusy(true); setMsg(null)
    const body = form.kind === 'client'
      ? { kind: 'client', full_name: form.full_name.trim(), email: form.email.trim() }
      : { kind: 'staff', full_name: form.full_name.trim(), email: form.email.trim(), role: form.role, job_title: form.job_title.trim(), department_ids: form.department_ids }
    const err = await postInvite(body)
    setBusy(false)
    if (err) return setMsg({ ok: false, text: err })
    setMsg({ ok: true, text: `Invite sent to ${form.email}.` })
    setForm(emptyInviteUserForm())
    setErrors({})
    setTouched({})
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => { setForm(emptyInviteUserForm()); setMsg(null); setErrors({}); setTouched({}); setOpen(true) }}><UserPlus className="h-4 w-4" /> Add user</Button>
      <Modal open={open} onClose={closeModal}
             title={form.kind === 'staff' ? 'Invite a team member' : 'Invite a client'}
             description={form.kind === 'staff'
               ? 'Add their details, choose a role and department, then send an email to set up their account.'
               : 'Add their contact email. They’ll complete their company profile after setting a password.'}
             dialogClassName="flex max-h-[92vh] flex-col overflow-hidden"
             bodyClassName="!py-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 -mr-6 overflow-y-auto">
            <div className="mr-6 space-y-4">
          {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
          <Field label="Type" required>
            <div className="inline-flex h-10 w-fit gap-0 rounded-xl border border-slate-200 bg-white p-0.5 text-sm shadow-card">
              {([
                ['client', 'Client', Building2],
                ['staff', 'Team member', UsersRound],
              ] as const).map(([v, l, Icon]) => (
                <button key={v} type="button" onClick={() => { setForm(current => ({ ...current, kind: v, role: v === 'staff' ? '' : current.role })); setErrors({}); setTouched({}) }}
                        className={cn(
                          'inline-flex h-full flex-none items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
                          form.kind === v
                            ? 'bg-brand-700 font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
                            : 'bg-white font-medium text-slate-800',
                        )}>
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {l}
                </button>
              ))}
            </div>
          </Field>

          <Field label={form.kind === 'client' ? 'Contact name' : 'Full name'} required={form.kind === 'staff'} error={errors.full_name} errorId="add-user-name-error">
            <input className={inviteInputClass(!!errors.full_name)} aria-invalid={!!errors.full_name} aria-describedby={errors.full_name ? 'add-user-name-error' : undefined} value={form.full_name}
                   onChange={e => {
                     const value = e.currentTarget.value
                     setForm(current => ({ ...current, full_name: value }))
                     setErrors(current => ({
                       ...current,
                       full_name: form.kind === 'staff' && touched.full_name ? validateStaffInviteField('full_name', value) : undefined,
                     }))
                   }}
                   spellCheck={false} autoCorrect="off" autoCapitalize="words" />
          </Field>
          <Field label="Email" required error={errors.email} errorId="add-user-email-error">
            <input className={inviteInputClass(!!errors.email)} type="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'add-user-email-error' : undefined} value={form.email}
                   onChange={e => {
                     const value = e.currentTarget.value
                     setForm(current => ({ ...current, email: value }))
                     setErrors(current => ({ ...current, email: touched.email ? validateStaffInviteField('email', value) : undefined }))
                   }}
                   />
          </Field>

          {form.kind === 'staff' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role" required error={errors.role} errorId="add-user-role-error">
                  <select className={inviteInputClass(!!errors.role)} aria-invalid={!!errors.role} aria-describedby={errors.role ? 'add-user-role-error' : undefined} value={form.role || ''}
                          onChange={e => {
                            const value = e.currentTarget.value as StaffRole | ''
                            setForm(current => ({ ...current, role: value }))
                            setErrors(current => ({ ...current, role: touched.role ? validateStaffInviteField('role', value) : undefined }))
                          }}
                          >
                    <option value="">Select role</option>
                    {staffRoleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Job title" required error={errors.job_title} errorId="add-user-title-error">
                  <input className={inviteInputClass(!!errors.job_title)} aria-invalid={!!errors.job_title} aria-describedby={errors.job_title ? 'add-user-title-error' : undefined} value={form.job_title}
                         onChange={e => {
                           const value = e.currentTarget.value
                           setForm(current => ({ ...current, job_title: value }))
                           setErrors(current => ({ ...current, job_title: touched.job_title ? validateStaffInviteField('job_title', value) : undefined }))
                         }}
                         placeholder="e.g. Ads Executive" spellCheck={false} autoCorrect="off" />
                </Field>
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
            </div>
          </div>
          <div className="mt-4 -mx-6 flex justify-end gap-2 border-t border-slate-100 px-6 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal}>Close</Button>
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
            <Badge className={cn('border bg-white transition-colors', ROLE_STYLES[i.role].badge)}>{ROLE_LABELS[i.role]}</Badge>
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
