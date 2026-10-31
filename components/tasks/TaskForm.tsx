'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ChevronDown, Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Avatar, Field } from '@/components/ui/primitives'
import { DEADLINE_OPTIONS, PRIORITY_OPTIONS, TICKET_STATUS_LABELS, TYPE_OPTIONS } from '@/lib/constants'
import { cn, dueDateFor, errorMessage, ticketCode } from '@/lib/utils'
import type { AppRole, Department, DeadlineType, Platform, Service, Task, TaskPriority, TaskType, TicketStatus } from '@/types/database'

type Option = { id: string; name: string; avatarUrl?: string | null; employeeId?: string; role?: string; avatarRole?: AppRole }
type TicketOption = { id: string; ticket_number: number; subject: string; status: TicketStatus }
type SelectOption = { value: string; label: string; detail?: string }

function FormSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  invalid = false,
  required = false,
  'aria-label': ariaLabel,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  required?: boolean
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Element && !event.target.closest('[data-form-select]')) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="relative" data-form-select>
      <button type="button" className={cn('input flex w-full items-center justify-between text-left', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-200')}
              disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
              aria-required={required} aria-invalid={invalid} onClick={() => setOpen(current => !current)}>
        <span className="truncate">{selected?.label ?? label}</span>
        <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div role="listbox" aria-label={ariaLabel ?? label} className="absolute z-30 mt-1 max-h-64 w-full space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {options.map(option => {
            const isSelected = option.value === value
            return (
              <button key={option.value} type="button" role="option" aria-selected={isSelected}
                      onClick={() => { onChange(option.value); setOpen(false) }}
                      className={cn('w-full rounded-lg px-3 py-2 text-left transition-colors',
                        isSelected ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-[#f3f5f4]')}>
                <span className="block truncate text-sm">{option.label}</span>
                {option.detail && <span className="mt-0.5 block text-xs text-slate-500">{option.detail}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export type TaskFormProps = {
  mode: 'create' | 'edit'
  task?: Task
  defaultClientId?: string
  defaultAssigneeId?: string
  canMarkUrgent: boolean
  /** false when an employee is editing a task that's already assigned — only managers/admins can then change assignee/due date. */
  canEditAssignment?: boolean
  clients: { id: string; company_name: string }[]
  assignees: Option[]
  departments: Department[]
  platforms: Platform[]
  services: Service[]
  meId: string
}

export function TaskForm(p: TaskFormProps) {
  const router = useRouter()
  const t = p.task
  const [form, setForm] = useState({
    title:           t?.title ?? '',
    description:     t?.description ?? '',
    client_id:       t?.client_id ?? p.defaultClientId ?? '',
    type:            (t?.type ?? 'task') as TaskType,
    priority:        (t?.priority ?? 'P3') as TaskPriority,
    is_urgent:       t?.is_urgent ?? false,
    service_id:      t?.service_id ?? '',
    department_id:   t?.department_id ?? '',
    platform_id:     t?.platform_id ?? '',
    assignee_id:     t?.assignee_id
                     ?? (p.defaultAssigneeId && p.assignees.some(a => a.id === p.defaultAssigneeId) ? p.defaultAssigneeId : null)
                     ?? (p.mode === 'create' && p.assignees.length === 1 ? p.meId : ''),
    ticket_id:       t?.ticket_id ?? '',
    due_date:        t?.due_date ?? '',
    deadline_type:   (t?.deadline_type ?? '') as DeadlineType | '',
    estimated_hours: String(t?.estimated_hours ?? 3),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [assigneeError, setAssigneeError] = useState('')
  const [tickets, setTickets] = useState<TicketOption[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))
  const canEditAssignment = p.canEditAssignment ?? true

  const activePlatforms = useMemo(() => p.platforms.filter(x => x.is_active || x.id === form.platform_id), [p.platforms, form.platform_id])
  const activeServices = useMemo(() => p.services.filter(x => x.is_active || x.id === form.service_id), [p.services, form.service_id])

  // A client can have several tickets — load that client's tickets so a task
  // can be traced back to the specific one it's for, instead of only the client.
  useEffect(() => {
    if (!form.client_id) { setTickets([]); return }
    let cancelled = false
    setLoadingTickets(true)
    createClient().from('tickets').select('id, ticket_number, subject, status').eq('client_id', form.client_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) { setTickets((data ?? []) as TicketOption[]); setLoadingTickets(false) } })
    return () => { cancelled = true }
  }, [form.client_id])

  useEffect(() => {
    if (!assigneeOpen) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Element && !event.target.closest('[data-assignee-picker]')) setAssigneeOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAssigneeOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [assigneeOpen])

  function pickClient(clientId: string) {
    // The previously picked ticket almost certainly belonged to the old client.
    setForm(f => ({ ...f, client_id: clientId, ticket_id: '' }))
  }

  function pickService(id: string) {
    const svc = p.services.find(s => s.id === id)
    setForm(f => ({ ...f, service_id: id, department_id: svc?.department_id ?? f.department_id }))
  }

  function pickDeadline(type: DeadlineType) {
    setForm(f => f.deadline_type === type
      ? { ...f, deadline_type: '', due_date: '' }
      : { ...f, deadline_type: type, due_date: dueDateFor(type) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (p.mode === 'create' && !form.assignee_id) {
      setAssigneeError('Please select an assignee before creating the task.')
      return
    }
    if (!form.client_id) return setError('Choose a client.')
    setSaving(true)
    setError('')

    const payload = {
      title:           form.title.trim(),
      description:     form.description.trim() || null,
      client_id:       form.client_id,
      ticket_id:       form.ticket_id || null,
      type:            form.type,
      priority:        form.priority,
      is_urgent:       form.is_urgent,
      service_id:      form.service_id || null,
      department_id:   form.department_id || null,
      platform_id:     form.platform_id || null,
      assignee_id:     form.assignee_id || null,
      due_date:        form.due_date || null,
      deadline_type:   form.deadline_type || null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
    }

    const supabase = createClient()
    const { data, error } = p.mode === 'create'
      ? await supabase.from('tasks').insert(payload).select('id').single()
      : await supabase.from('tasks').update(payload).eq('id', t!.id).select('id').single()

    if (error) {
      setError(errorMessage(error))
      setSaving(false)
      return
    }
    router.push(`/tasks/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6 p-6">
      {error && <Alert>{error}</Alert>}

      <Field label="Title" required>
        <input className="input" required value={form.title} onChange={e => set('title', e.target.value)}
               placeholder="e.g. Launch Diwali sponsored ads on Amazon" autoFocus={p.mode === 'create'} />
      </Field>

      <Field label="Description">
        <textarea className="input min-h-[110px]" value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Details, links, marketplace case IDs…" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Client" required>
          <FormSelect label="Select client…" value={form.client_id}
            options={[{ value: '', label: 'Select client…' }, ...p.clients.map(c => ({ value: c.id, label: c.company_name }))]}
            onChange={pickClient} required aria-label="Client" />
        </Field>
        <Field label="Ticket"
               hint={!form.client_id ? 'Pick a client first' : loadingTickets ? 'Loading…' : tickets.length === 0 ? 'No tickets for this client' : 'Links this task back to the request it\'s for'}>
          <FormSelect label="No ticket (standalone task)" value={form.ticket_id} disabled={!form.client_id || loadingTickets}
            options={[{ value: '', label: 'No ticket (standalone task)' }, ...tickets.map(tk => ({
              value: tk.id,
              label: `${ticketCode(tk.ticket_number)} · ${tk.subject}${tk.status === 'closed' ? ` (${TICKET_STATUS_LABELS[tk.status]})` : ''}`,
            }))]}
            onChange={value => set('ticket_id', value)} aria-label="Ticket" />
        </Field>
        <Field label="Type">
          <FormSelect label="Type" value={form.type} options={TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            onChange={value => set('type', value as TaskType)} aria-label="Type" />
        </Field>
        <Field label="Service">
          <FormSelect label="—" value={form.service_id} options={[{ value: '', label: '—' }, ...activeServices.map(s => ({ value: s.id, label: s.name }))]}
            onChange={pickService} aria-label="Service" />
        </Field>
        <Field label="Department">
          <FormSelect label="—" value={form.department_id} options={[{ value: '', label: '—' }, ...p.departments.map(d => ({ value: d.id, label: d.name }))]}
            onChange={value => set('department_id', value)} aria-label="Department" />
        </Field>
        <Field label="Platform">
          <FormSelect label="—" value={form.platform_id} options={[{ value: '', label: '—' }, ...activePlatforms.map(x => ({ value: x.id, label: x.name }))]}
            onChange={value => set('platform_id', value)} aria-label="Platform" />
        </Field>
        <Field label="Assignee" required={p.mode === 'create'}
               hint={!canEditAssignment ? 'Only managers can change the assignee.' : p.assignees.length === 1 ? 'You can assign tasks to yourself.' : undefined}>
          <div className="relative" data-assignee-picker>
            <button type="button" className="input flex w-full items-center justify-between text-left"
                    disabled={!canEditAssignment} aria-haspopup="listbox" aria-expanded={assigneeOpen}
                    aria-required={p.mode === 'create'} aria-invalid={!!assigneeError}
                    onClick={() => setAssigneeOpen(open => !open)}>
              <span className="flex min-w-0 items-center gap-2">
                {form.assignee_id
                  ? (() => {
              const selected = p.assignees.find(a => a.id === form.assignee_id)
              return selected ? <><span className="relative h-5 w-5 shrink-0"><Avatar name={selected.name} src={selected.avatarUrl} role={selected.avatarRole} size="xs" className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-xs" /></span><span className="truncate">{selected.name}{selected.id === p.meId ? ' (me)' : ''}</span></> : 'Select assignee…'
                    })()
                  : 'Unassigned'}
              </span>
              <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
            </button>
            {assigneeOpen && (
              <div role="listbox" aria-label="Assignee" className="absolute z-30 mt-1 max-h-64 w-full space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {[{ id: '', name: 'Unassigned' }, ...p.assignees].map(a => {
                  const selected = form.assignee_id === a.id
                  return (
                    <button key={a.id || 'unassigned'} type="button" role="option" aria-selected={selected}
                            onClick={() => { set('assignee_id', a.id); if (a.id) setAssigneeError(''); setAssigneeOpen(false) }}
                            className={cn('w-full rounded-lg px-3 py-2 text-left transition-colors', selected ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-[#f3f5f4]')}>
                      <span className="flex min-w-0 items-center gap-2">
                        {a.id && <Avatar name={a.name} src={a.avatarUrl} role={a.avatarRole} size="sm" />}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{a.name}{a.id === p.meId ? ' (me)' : ''}</span>
                          {'role' in a && a.role && <span className="mt-0.5 block text-xs text-slate-500">({a.role})</span>}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {assigneeError && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
              <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{assigneeError}</span>
            </p>
          )}
        </Field>
        <Field label="Priority">
          <FormSelect label="Priority" value={form.priority} options={PRIORITY_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            onChange={value => set('priority', value as TaskPriority)} aria-label="Priority" />
        </Field>
        <Field label="Estimated hours">
          <input className="input" type="number" min="0" step="0.5" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} />
        </Field>
      </div>

      <Field label="Deadline" hint={!canEditAssignment ? 'Only managers can change the due date.' : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          {DEADLINE_OPTIONS.map(d => (
            <button key={d.value} type="button" disabled={!canEditAssignment} onClick={() => pickDeadline(d.value)}
                    className={cn('rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-50',
                      form.deadline_type === d.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
              {d.label}
            </button>
          ))}
          <input type="date" className="input w-auto" value={form.due_date} disabled={!canEditAssignment}
                 onChange={e => setForm(f => ({ ...f, due_date: e.target.value, deadline_type: '' }))} />
        </div>
      </Field>

      {p.canMarkUrgent && (
        <label className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition',
          form.is_urgent ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50')}>
          <input type="checkbox" checked={form.is_urgent} onChange={e => set('is_urgent', e.target.checked)}
                 className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
          <Flame className={cn('h-5 w-5', form.is_urgent ? 'text-red-600' : 'text-slate-400')} />
          <span className="text-sm">
            <span className="font-semibold text-slate-900">Mark as urgent</span>
            <span className="block text-slate-500">Everyone on the team will see it in the urgent pool and can pick it up.</span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={saving}>{p.mode === 'create' ? 'Create task' : 'Save changes'}</Button>
      </div>
    </form>
  )
}
