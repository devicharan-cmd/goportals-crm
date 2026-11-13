'use client'

import { createPortal } from 'react-dom'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Check, ChevronDown, Layers3, Mail, MoreHorizontal, Phone, Search, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Alert, Avatar, EmptyState, Field } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { ROLE_LABELS, ROLE_STYLES } from '@/lib/constants'
import { cn, errorMessage, formatRelative } from '@/lib/utils'
import { showErrorToast, showSuccessToast } from '@/lib/ui-toast'
import type { AccountStatus, AppRole, Department, Invite, StaffRole } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

export type StaffRow = {
  id: string; full_name: string; email: string; role: StaffRole; status: AccountStatus
  job_title: string | null; weekly_capacity_hours: number; created_at: string; departmentIds: string[]
  reporting_to: string | null; reporting_to_name: string | null; avatar_url: string | null; phone: string | null
  current_address: string | null; permanent_address: string | null
}

export type ReportingPerson = { id: string; full_name: string; email: string; avatar_url: string | null; role: StaffRole; status: AccountStatus }
type ReportingDropdownPosition = { left: number; top: number; width: number; maxHeight: number; openBelow: boolean }

export function StaffDirectory({ rows, departments, canEdit, actorId, inviteButton }: {
  rows: StaffRow[]; departments: Department[]; canEdit: boolean; actorId: string; inviteButton: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const departmentNames = useMemo(() => new Map(departments.map(department => [department.id, department.name])), [departments])
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return rows.filter(row => {
      if (role && row.role !== role) return false
      if (departmentId && !row.departmentIds.includes(departmentId)) return false
      if (!normalizedQuery) return true
      const searchableText = [
        row.full_name, row.email, row.job_title ?? '', ROLE_LABELS[row.role],
        ...row.departmentIds.map(id => departmentNames.get(id) ?? ''),
      ].join(' ').toLowerCase()
      return searchableText.includes(normalizedQuery)
    })
  }, [departmentId, departmentNames, query, role, rows])

  return (
    <>
      <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Team management ({rows.length})</h2>
        <p className="text-xs text-slate-500">
          Manage team roles, departments, and capacity. Managers can see every department; Team Leads can see and assign within their own.
        </p>
      </div>
      <div className="grid grid-cols-1 items-center gap-2 border-b border-slate-100 p-4 sm:grid-cols-[minmax(0,1fr)_130px_150px_auto]">
        <label className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search team members..."
            aria-label="Search team members"
            className="form-field h-9 w-full min-w-0 rounded-xl pl-9 text-sm focus:border-[#045E80] focus:outline-none focus:ring-0 focus:shadow-none"
          />
        </label>
        <SearchableSelect
          className="form-field h-9 w-[130px] shrink-0 rounded-xl py-1.5 text-sm focus:border-[#045E80] focus:outline-none focus:ring-0 focus:shadow-none"
          aria-label="Filter by role"
          value={role}
          onChange={event => setRole(event.target.value)}
        >
          <option value="">All roles</option>
          {(['super_admin', 'manager', 'team_lead', 'employee'] as StaffRole[]).map(value => (
            <option key={value} value={value}>{ROLE_LABELS[value]}</option>
          ))}
        </SearchableSelect>
        <SearchableSelect
          className="form-field h-9 w-[150px] shrink-0 rounded-xl py-1.5 text-sm focus:border-[#045E80] focus:outline-none focus:ring-0 focus:shadow-none"
          aria-label="Filter by department"
          searchable
          searchPlaceholder="Search departments..."
          value={departmentId}
          onChange={event => setDepartmentId(event.target.value)}
        >
          <option value="">All departments</option>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </SearchableSelect>
        <div className="shrink-0">{inviteButton}</div>
      </div>
      {filteredRows.length ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRows.map(row => (
            <StaffProfileCard key={row.id} row={row} departments={departments} canEdit={canEdit} actorId={actorId} />
          ))}
        </div>
      ) : (
        <EmptyState title="No team members found" description="Try changing your search or filters." />
      )}
    </>
  )
}

function reportingRoleFor(role: StaffRole | ''): StaffRole | null {
  if (role === 'manager') return 'super_admin'
  if (role === 'team_lead') return 'manager'
  if (role === 'employee') return 'team_lead'
  return null
}

function reportingOptionsFor(role: StaffRole | '', people: ReportingPerson[]) {
  const expectedRole = reportingRoleFor(role)
  return expectedRole ? people.filter(person => person.role === expectedRole && person.status === 'active') : []
}

function ReportingToField({
  role, people, value, onChange, error, disabled = false, idPrefix,
}: {
  role: StaffRole | ''
  people: ReportingPerson[]
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  idPrefix: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<ReportingDropdownPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const options = reportingOptionsFor(role, people)
  const selected = options.find(person => person.id === value)
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return options
    return options.filter(person =>
      `${person.full_name} ${person.email} ${ROLE_LABELS[person.role]}`.toLowerCase().includes(query))
  }, [options, search])
  const noOptionsText = role === 'manager'
    ? 'No active Super Admin is available.'
    : role === 'team_lead'
      ? 'No active Managers are available.'
      : 'No active Team Leads are available.'

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      setSearch('')
      return
    }

    const updatePosition = () => {
      const button = buttonRef.current
      const dialog = button?.closest<HTMLElement>('[role="dialog"]')
      if (!button || !dialog) return

      const dialogRect = dialog.getBoundingClientRect()
      const content = dialog.querySelector<HTMLElement>('[data-modal-content]')
      const buttonRect = button.getBoundingClientRect()
      const contentRect = content?.getBoundingClientRect()
      const boundsTop = Math.max(dialogRect.top, contentRect?.top ?? dialogRect.top) + 8
      const footer = dialog.querySelector<HTMLElement>('[data-modal-footer]')
      const boundsBottom = Math.max(
        boundsTop,
        Math.min(contentRect?.bottom ?? dialogRect.bottom, footer?.getBoundingClientRect().top ?? dialogRect.bottom) - 8,
      )
      const width = Math.min(buttonRect.width, Math.max(0, dialogRect.width - 24))
      const left = Math.min(Math.max(buttonRect.left, dialogRect.left + 12), dialogRect.right - width - 12)
      const availableBelow = Math.max(0, boundsBottom - buttonRect.bottom - 8)
      const availableAbove = Math.max(0, buttonRect.top - boundsTop - 8)
      const openBelow = availableBelow >= availableAbove
      const maxHeight = Math.min(320, openBelow ? availableBelow : availableAbove)
      setPosition({ left, top: openBelow ? buttonRect.bottom + 8 : buttonRect.top - maxHeight - 8, width, maxHeight, openBelow })
    }

    updatePosition()
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus())
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !position || position.openBelow) return
    const button = buttonRef.current
    const dropdown = dropdownRef.current
    if (!button || !dropdown) return
    const top = button.getBoundingClientRect().top - dropdown.getBoundingClientRect().height - 8
    setPosition(current => current && current.top !== top ? { ...current, top } : current)
  }, [open, position])

  useLayoutEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (!role || role === 'super_admin') return null

  return (
    <Field label="Reporting To (POC)" required error={error} errorId={`${idPrefix}-error`}
           hint={options.length ? 'Select the direct person this team member reports to.' : noOptionsText}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || options.length === 0}
        className={cn(
          'form-field flex h-9 w-full items-center justify-between gap-2 rounded-xl text-left text-sm focus:!shadow-none focus:!ring-0 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50',
          error && 'border-red-500 focus:border-red-500 focus:!shadow-none',
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${idPrefix}-error` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected && <Avatar name={selected.full_name || selected.email} src={selected.avatar_url} role={selected.role} size="sm" />}
          <span className="min-w-0 truncate">
            {selected ? selected.full_name || selected.email : options.length ? 'Select reporting person' : 'No eligible reporting person'}
          </span>
          {selected && <span className="shrink-0 text-xs text-slate-500">{ROLE_LABELS[selected.role]}</span>}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[1200] overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        >
          <div className="relative mb-2">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search people..."
              aria-label="Search reporting people"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#0A6F94] focus:bg-white focus:shadow-none focus:ring-0"
            />
          </div>
          <div
            role="listbox"
            aria-label="Reporting person"
            className="space-y-1 overflow-y-auto"
            style={{ maxHeight: Math.max(0, position.maxHeight - 60) }}
          >
            {filteredOptions.map(person => {
              const active = person.id === value
              return (
                <button
                  key={person.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(person.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                    active ? 'bg-[#EAF4F8]' : 'hover:bg-slate-50',
                  )}
                >
                  <Avatar name={person.full_name || person.email} src={person.avatar_url} role={person.role} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{person.full_name || person.email}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{ROLE_LABELS[person.role]}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-[#045E80]" />}
                </button>
              )
            })}
            {filteredOptions.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-500">No people found.</p>}
          </div>
        </div>,
        document.body,
      )}
    </Field>
  )
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
  const runOnce = useSingleFlight()
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
        showErrorToast(message)
        return
      }
      showSuccessToast(`Account and related personal data for ${result.email ?? account.email} deleted.`)
      setOpen(false)
      router.refresh()
    } catch (requestError) {
      const message = errorMessage(requestError)
      setError(message)
      showErrorToast(message)
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
          <Button variant="danger" size="sm" loading={busy} onClick={() => void runOnce('delete-account', remove)}>Delete account and data</Button>
        </div>
      </Modal>
    </li>
  )
}

function emptyInviteUserForm() {
  return { kind: 'client' as 'client' | 'staff', full_name: '', email: '', role: '' as StaffRole | '', reporting_to: '', job_title: '', department_ids: [] as string[] }
}

type StaffInviteErrors = Partial<Record<'full_name' | 'email' | 'role' | 'reporting_to' | 'job_title' | 'departments', string>>
type StaffInviteField = Exclude<keyof StaffInviteErrors, 'departments'>
type StaffInviteTouched = Partial<Record<StaffInviteField | 'departments', boolean>>
type StaffInviteValues = { full_name: string; email: string; role: StaffRole | ''; reporting_to: string; job_title: string; department_ids: string[] }

function validateStaffInviteField(field: StaffInviteField, value: string | StaffRole) {
  const trimmedValue = value.trim()
  if (field === 'full_name' && !trimmedValue) return 'Enter the team member’s full name.'
  if (field === 'email') {
    if (!trimmedValue) return 'Enter an email address.'
    if (!/^\S+@\S+\.\S+$/.test(trimmedValue)) return 'Enter a valid email address.'
  }
  if (field === 'role' && !value) return 'Select a role.'
  if (field === 'reporting_to' && !value) return 'Select a Reporting To person.'
  if (field === 'job_title' && !trimmedValue) return 'Enter a job title.'
  return undefined
}

function validateStaffInvite(form: StaffInviteValues, people: ReportingPerson[]): StaffInviteErrors {
  const fields: StaffInviteField[] = ['full_name', 'email', 'role', 'job_title']
  if (form.role && form.role !== 'super_admin') fields.push('reporting_to')
  const errors = Object.fromEntries(fields.flatMap(field => {
    const error = validateStaffInviteField(field, form[field])
    return error ? [[field, error]] : []
  })) as StaffInviteErrors
  if (form.role && form.role !== 'super_admin'
      && !reportingOptionsFor(form.role, people).some(person => person.id === form.reporting_to)) {
    errors.reporting_to = reportingOptionsFor(form.role, people).length
      ? 'Select an eligible Reporting To person.'
      : 'No eligible Reporting To person is available.'
  }
  if (form.department_ids.length === 0) {
    errors.departments = 'Select at least one department.'
  }
  return errors
}

function inviteInputClass(invalid: boolean) {
  return cn(
    'form-field rounded-xl focus:outline-none focus:ring-0 focus:shadow-none',
    invalid ? 'border-red-500 focus:border-red-500' : 'focus:border-[#045E80]',
  )
}

export function StaffProfileCard({ row, departments, canEdit, actorId }: {
  row: StaffRow; departments: Department[]; canEdit: boolean; actorId: string
}) {
  const departmentsById = new Map(departments.map(department => [department.id, department.name]))
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const canDelete = canEdit && row.id !== actorId && row.role !== 'super_admin'

  async function deleteStaffAccount() {
    setDeleting(true)
    setDeleteError('')
    try {
      const response = await fetch(`/api/admin/staff/${row.id}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) {
        setDeleteError(typeof result.error === 'string' ? result.error : 'Could not delete this staff account.')
        return
      }
      setDeleteOpen(false)
      showSuccessToast(`${row.full_name || row.email} was permanently deleted.`)
      router.refresh()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this staff account.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <article
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]"
    >
        <div className="pointer-events-none relative z-30 h-32 overflow-hidden rounded-t-2xl bg-gradient-to-br from-sky-400 via-sky-300 to-blue-400">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-8 left-[-10%] h-24 w-[120%] rounded-[50%] bg-white" />
          <Badge className={cn('absolute left-3 top-3 z-10', row.status === 'active'
            ? 'bg-[#F5FAE8] text-[#5B771A] ring-[#D3E896]'
            : 'bg-slate-100 text-slate-600 ring-slate-200')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', row.status === 'active' ? 'bg-[#95C12C]' : 'bg-slate-400')} />
            {row.status === 'active' ? 'Active' : 'Suspended'}
          </Badge>
          {canDelete && (
            <div className="pointer-events-auto absolute right-3 top-3 z-40" onClick={event => event.stopPropagation()}>
              <button
                type="button"
                aria-label={`Actions for ${row.full_name || row.email}`}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(open => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-100 text-[#033B51] shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#045E80]"
              >
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-50 min-w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setDeleteError('')
                      setDeleteOpen(true)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
          <Avatar name={row.full_name || row.email} src={row.avatar_url} role={row.role} size="lg"
            className={cn('absolute left-1/2 top-8 z-10 h-20 w-20 -translate-x-1/2 border-4 border-white text-2xl shadow-sm', row.status !== 'active' && 'grayscale')} />
        </div>
        <div className="pointer-events-none relative z-30 flex flex-1 flex-col bg-white px-3.5 pb-4 pt-2">
          <div className="text-center">
            <p title={row.full_name || row.email} className="truncate text-base font-bold leading-6 text-slate-900">
              {row.full_name.trim() || '--'}
            </p>
            <p title={row.job_title || undefined} className="mt-0.5 truncate text-sm leading-5 text-slate-500">{row.job_title?.trim() || '--'}</p>
            <Badge className="mt-2 bg-sky-100 text-blue-700 ring-sky-200">{ROLE_LABELS[row.role]}</Badge>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-700" />
              {row.email.trim()
                ? <a href={`mailto:${row.email}`} title={row.email} onClick={event => event.stopPropagation()} className="pointer-events-auto block min-w-0 flex-1 truncate whitespace-nowrap text-slate-900 hover:text-[#034C68]">{row.email}</a>
                : <span className="text-slate-800">--</span>}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-700" />
              {row.phone?.trim()
                ? <a href={`tel:${row.phone.trim().replace(/[^+\d]/g, '')}`} onClick={event => event.stopPropagation()} className="pointer-events-auto truncate whitespace-nowrap text-slate-900 hover:text-[#034C68]">{row.phone}</a>
                : <span className="text-slate-900">--</span>}
            </div>
          </div>

          <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
            <div className="flex min-w-0 items-start gap-2">
              <UsersRound aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Reporting To</p>
                <p className="break-words font-medium text-slate-900">{row.reporting_to_name?.trim() || '--'}</p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <Layers3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Departments</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {row.departmentIds.map(id => departmentsById.get(id)).filter((name): name is string => !!name).length
                    ? row.departmentIds.map(id => departmentsById.get(id)).filter((name): name is string => !!name).map(name => (
                      <span key={name} className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-900">{name}</span>
                    ))
                    : <span className="text-slate-900">--</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      <Link
        href={`/admin/users/${row.id}`}
        aria-label={`View ${row.full_name || row.email} staff profile`}
        className="absolute inset-0 z-20 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#045E80]"
      />
      {canDelete && (
        <Modal
          open={deleteOpen}
          onClose={() => !deleting && setDeleteOpen(false)}
          title={`Permanently delete ${row.full_name || row.email}?`}
          description="This action cannot be undone."
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This permanently removes the staff account and profile. Existing tasks, tickets, comments, activity, attachments, and time logs will remain. Tasks and tickets assigned to this person will be reassigned to their Reporting To person. Tasks they assigned to others will stay assigned as they are; only this person&apos;s profile reference will be cleared.
            </p>
            {deleteError && <Alert tone="error">{deleteError}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={deleting} onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" loading={deleting} onClick={() => void runOnce('delete-staff-account', deleteStaffAccount)}>
                <Trash2 className="h-4 w-4" />
                Permanently delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </article>
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
  const runOnce = useSingleFlight()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const supabase = createClient()
  // Role/status/job title/capacity changes are Super-Admin-only in the DB (guard_profile_update) —
  // a Manager can only manage department membership here, not these fields.
  const canEditProfile = actorRole === 'super_admin'
  const canEditDepartments = actorRole === 'super_admin' || actorRole === 'manager'
  // full_name is the one field the DB lets anyone change on their own row.
  const canEditName = canEditProfile || isMe

  async function update(fields: Record<string, unknown>) {
    await runOnce(`update-profile-${Object.keys(fields).sort().join('-')}`, async () => {
      setBusy(true); setError('')
      const { error } = await supabase.from('profiles').update(fields).eq('id', row.id)
      setBusy(false)
      if (error) setError(errorMessage(error))
      router.refresh()
    })
  }

  async function toggleDept(deptId: string) {
    await runOnce(`toggle-department-${deptId}`, async () => {
      setBusy(true); setError('')
      const { error } = row.departmentIds.includes(deptId)
        ? await supabase.from('department_members').delete().eq('department_id', deptId).eq('profile_id', row.id)
        : await supabase.from('department_members').insert({ department_id: deptId, profile_id: row.id })
      setBusy(false)
      if (error) setError(errorMessage(error))
      router.refresh()
    })
  }

  return (
    <li className={cn('px-5 py-4', row.status !== 'active' && 'bg-slate-50/70 opacity-75')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={row.full_name || row.email} src={row.avatar_url} role={row.role} />
          <div className="min-w-0 flex-1">
            {/* Everyone may fix their own name; a super admin may fix anyone's.
                Without this, accounts invited without one show as a raw email
                across the team list, assignee pickers and activity trails. */}
            <div className="flex items-center gap-2">
              <input defaultValue={row.full_name ?? ''} placeholder="Full name" disabled={busy} readOnly={!canEditName}
                     aria-label={`Full name for ${row.full_name || row.email}`}
                     onBlur={e => canEditName && e.target.value.trim() !== (row.full_name ?? '') && update({ full_name: e.target.value.trim() })}
                     spellCheck={false} autoCorrect="off" className="form-field h-8 w-full max-w-56 py-1 text-sm font-semibold read-only:cursor-default" />
              {isMe && <span className="text-xs text-slate-400">(you)</span>}
            </div>
            <p className="truncate text-xs text-slate-500">{row.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input defaultValue={row.job_title ?? ''} placeholder="Job title (e.g. Team Lead)" disabled={busy || !canEditProfile}
                 onBlur={e => {
                   const value = e.target.value.trim()
                   if (!value) {
                     setError('Job title is required.')
                     e.target.value = row.job_title ?? ''
                     return
                   }
                   if (value !== (row.job_title ?? '')) update({ job_title: value })
                 }}
                 spellCheck={false} autoCorrect="off" className="form-field h-8 w-44 py-1 text-xs" />
          {canEditProfile ? (
            <SearchableSelect value={row.role} disabled={busy || isMe} onChange={e => update({ role: e.target.value })} className="h-8 w-auto py-1 text-xs">
              {(['super_admin', 'manager', 'team_lead', 'employee'] as StaffRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </SearchableSelect>
          ) : (
            <span className={cn('rounded-md border bg-white px-2 py-1 text-xs font-medium transition-colors', ROLE_STYLES[row.role].badge)}>{ROLE_LABELS[row.role]}</span>
          )}
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="number" min="1" max="80" defaultValue={row.weekly_capacity_hours} disabled={busy || !canEditProfile}
                   onBlur={e => Number(e.target.value) !== row.weekly_capacity_hours && update({ weekly_capacity_hours: Number(e.target.value) || 40 })}
                   className="form-field h-8 w-16 py-1 text-xs" /> h/wk
          </label>
          {canEditProfile ? (
            <SearchableSelect value={row.status} disabled={busy || isMe} onChange={e => update({ status: e.target.value })}
                    className={cn('form-field h-8 w-auto py-1 text-xs', row.status !== 'active' && 'text-red-700')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </SearchableSelect>
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
                      on ? 'bg-[#045E80] text-white ring-[#045E80]' : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300')}>
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
  departments, roles = ['employee', 'team_lead', 'manager', 'super_admin'], reportingPeople,
}: { departments: Department[]; roles?: StaffRole[]; reportingPeople: ReportingPerson[] }) {
  const onlyEmployees = roles.length === 1 && roles[0] === 'employee'
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [errors, setErrors] = useState<StaffInviteErrors>({})
  const [touched, setTouched] = useState<StaffInviteTouched>({})
  const empty = { full_name: '', email: '', role: onlyEmployees ? 'employee' as StaffRole : '' as StaffRole | '', reporting_to: '', job_title: '', department_ids: [] as string[] }
  const [form, setForm] = useState(empty)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const validationErrors = validateStaffInvite(form, reportingPeople)
    setTouched({ full_name: true, email: true, role: true, reporting_to: true, job_title: true, departments: true })
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
        <form onSubmit={event => void runOnce('invite-staff', () => submit(event))} className="space-y-4" noValidate spellCheck={false}>
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
              <SearchableSelect className={inviteInputClass(!!errors.role)} aria-invalid={!!errors.role} aria-describedby={errors.role ? 'staff-invite-role-error' : undefined} value={form.role || ''} disabled={onlyEmployees}
                      onChange={e => {
                        const value = e.currentTarget.value as StaffRole | ''
                        const options = reportingOptionsFor(value, reportingPeople)
                        const reportingTo = value === 'manager' && options.length === 1 ? options[0].id : ''
                        setForm(current => ({ ...current, role: value, reporting_to: reportingTo }))
                        setErrors(current => ({
                          ...current,
                          role: touched.role ? validateStaffInviteField('role', value) : undefined,
                          reporting_to: touched.reporting_to && value && value !== 'super_admin' && !reportingTo
                            ? 'Select a Reporting To person.' : undefined,
                        }))
                      }}
                      >
                {!onlyEmployees && <option value="">Select role</option>}
                {roles.includes('employee') && <option value="employee">Employee</option>}
                {roles.includes('team_lead') && <option value="team_lead">Team Lead</option>}
                {roles.includes('manager') && <option value="manager">Manager</option>}
                {roles.includes('super_admin') && <option value="super_admin">Super Admin</option>}
              </SearchableSelect>
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
          <ReportingToField
            role={form.role}
            people={reportingPeople}
            value={form.reporting_to}
            error={errors.reporting_to}
            idPrefix="staff-invite-reporting"
            onChange={value => {
              setForm(current => ({ ...current, reporting_to: value }))
              setErrors(current => ({ ...current, reporting_to: touched.reporting_to ? validateStaffInviteField('reporting_to', value) : undefined }))
            }}
          />
          <Field label="Departments" required error={errors.departments} errorId="staff-invite-departments-error" hint="Team Leads see the tasks and tickets of their departments.">
            <div className="flex flex-wrap gap-1.5">
              {departments.map(d => {
                const on = form.department_ids.includes(d.id)
                return (
                  <button type="button" key={d.id}
                          aria-pressed={on}
                          onClick={() => {
                            const departmentIds = on ? form.department_ids.filter(x => x !== d.id) : [...form.department_ids, d.id]
                            setForm(current => ({ ...current, department_ids: departmentIds }))
                            if (touched.departments) {
                              setErrors(current => ({ ...current, departments: departmentIds.length ? undefined : 'Select at least one department.' }))
                            }
                          }}
                          className={cn('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                            on ? 'bg-[#045E80] text-white ring-[#045E80]' : 'bg-white text-slate-600 ring-slate-300')}>
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
export function InviteUserButton({ departments, actorRole, reportingPeople }: {
  departments: Department[]; actorRole: AppRole; reportingPeople: ReportingPerson[]
}) {
  const staffRoleOptions: { value: StaffRole; label: string }[] = actorRole === 'super_admin'
    ? [{ value: 'employee', label: 'Employee' }, { value: 'team_lead', label: 'Team Lead' },
       { value: 'manager', label: 'Manager' }, { value: 'super_admin', label: 'Super Admin' }]
    : [{ value: 'employee', label: 'Employee' }, { value: 'team_lead', label: 'Team Lead' }]
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [errors, setErrors] = useState<StaffInviteErrors>({})
  const [touched, setTouched] = useState<StaffInviteTouched>({})
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
      ? { full_name: true, email: true, role: true, reporting_to: true, job_title: true, departments: true }
      : { email: true })
    if (form.kind === 'staff') {
      const validationErrors = validateStaffInvite(form, reportingPeople)
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
      : { kind: 'staff', full_name: form.full_name.trim(), email: form.email.trim(), role: form.role, reporting_to: form.reporting_to || null, job_title: form.job_title.trim(), department_ids: form.department_ids }
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
        <form onSubmit={event => void runOnce('invite-user', () => submit(event))} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 -mr-6 overflow-y-auto">
            <div className="mr-6 space-y-4">
          {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
          <Field label="Type" required>
            <div className="inline-flex h-10 w-fit gap-0 rounded-xl border border-slate-200 bg-white p-0.5 text-sm [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]">
              {([
                ['client', 'Client', Building2],
                ['staff', 'Team member', UsersRound],
              ] as const).map(([v, l, Icon]) => (
                <button key={v} type="button" onClick={() => { setForm(current => ({ ...current, kind: v, role: v === 'staff' ? '' : current.role, reporting_to: '' })); setErrors({}); setTouched({}) }}
                        className={cn(
                          'inline-flex h-full flex-none items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
                          form.kind === v
                            ? 'bg-[#034C68] font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
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
                  <SearchableSelect className={inviteInputClass(!!errors.role)} aria-invalid={!!errors.role} aria-describedby={errors.role ? 'add-user-role-error' : undefined} value={form.role || ''}
                          onChange={e => {
                            const value = e.currentTarget.value as StaffRole | ''
                            const options = reportingOptionsFor(value, reportingPeople)
                            const reportingTo = value === 'manager' && options.length === 1 ? options[0].id : ''
                            setForm(current => ({ ...current, role: value, reporting_to: reportingTo }))
                            setErrors(current => ({
                              ...current,
                              role: touched.role ? validateStaffInviteField('role', value) : undefined,
                              reporting_to: touched.reporting_to && value && value !== 'super_admin' && !reportingTo
                                ? 'Select a Reporting To person.' : undefined,
                            }))
                          }}
                          >
                    <option value="">Select role</option>
                    {staffRoleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </SearchableSelect>
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
              <ReportingToField
                role={form.role}
                people={reportingPeople}
                value={form.reporting_to}
                error={errors.reporting_to}
                idPrefix="add-user-reporting"
                onChange={value => {
                  setForm(current => ({ ...current, reporting_to: value }))
                  setErrors(current => ({ ...current, reporting_to: touched.reporting_to ? validateStaffInviteField('reporting_to', value) : undefined }))
                }}
              />
              <Field label="Departments" required error={errors.departments} errorId="add-user-departments-error" hint="Team Leads see the tasks and tickets of their departments.">
                <div className="flex flex-wrap gap-1.5">
                  {departments.map(d => {
                    const on = form.department_ids.includes(d.id)
                    return (
                      <button type="button" key={d.id}
                              aria-pressed={on}
                              onClick={() => {
                                const departmentIds = on ? form.department_ids.filter(x => x !== d.id) : [...form.department_ids, d.id]
                                setForm(current => ({ ...current, department_ids: departmentIds }))
                                if (touched.departments) {
                                  setErrors(current => ({ ...current, departments: departmentIds.length ? undefined : 'Select at least one department.' }))
                                }
                              }}
                              className={cn('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                                on ? 'bg-[#045E80] text-white ring-[#045E80]' : 'bg-white text-slate-600 ring-slate-300')}>
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
  const runOnce = useSingleFlight()
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
            <button onClick={() => void runOnce(`cancel-invite-${i.id}`, () => cancel(i.id))} disabled={busy === i.id} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Cancel invite">
              <X className="h-4 w-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
