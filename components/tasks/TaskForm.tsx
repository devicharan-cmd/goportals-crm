'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ChevronDown, Flame, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Avatar, CompanyAvatar, Field } from '@/components/ui/primitives'
import { TaskBasicInformation } from '@/components/tasks/TaskBasicInformation'
import { AssigneeOptionContent } from '@/components/tasks/AssigneeOptionContent'
import { TaskFieldsGrid, TaskFormCard, TaskFormCardTitle, TaskSectionHeader } from '@/components/tasks/TaskFormSections'
import { MarketplacePlatformSelect } from '@/components/shared/Marketplace'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DEADLINE_OPTIONS, PRIORITY_OPTIONS, TICKET_STATUS_LABELS, TYPE_OPTIONS } from '@/lib/constants'
import { TICKET_CATEGORY_BY_VALUE } from '@/lib/ticket-categories'
import { cn, dueDateFor, errorMessage, ticketCode } from '@/lib/utils'
import type { AppRole, Department, DeadlineType, Platform, Service, Task, TaskPriority, TaskType, TicketStatus } from '@/types/database'

type Option = { id: string; name: string; avatarUrl?: string | null; employeeId?: string; role?: string; avatarRole?: AppRole }
type TicketOption = {
  id: string
  ticket_number: number
  subject: string
  status: TicketStatus
  category: keyof typeof TICKET_CATEGORY_BY_VALUE
  description: string | null
  details: Record<string, unknown> | null
}
type SelectOption = { value: string; label: string; detail?: string; content?: React.ReactNode; selectedContent?: React.ReactNode }

function FormSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  invalid = false,
  required = false,
  'aria-label': ariaLabel,
  className,
  native = false,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  required?: boolean
  'aria-label'?: string
  className?: string
  native?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value)

  useEffect(() => {
    if (!open || native) return
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
  }, [open, native])

  if (native) {
    return (
      <SearchableSelect className={cn('form-field h-9 text-sm', className)} value={value} disabled={disabled} required={required} aria-label={ariaLabel}
                        aria-required={required} aria-invalid={invalid} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </SearchableSelect>
    )
  }

  return (
    <div className="relative" data-form-select>
      <button type="button" className={cn('form-field flex w-full items-center justify-between text-left', className, invalid && 'border-red-400 focus:border-red-500 focus:ring-red-200')}
              disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
              aria-required={required} aria-invalid={invalid} onClick={() => setOpen(current => !current)}>
        <span className="min-w-0 flex-1">{selected?.selectedContent ?? selected?.content ?? selected?.label ?? label}</span>
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
                        isSelected ? 'bg-[#EAF4F8] font-medium text-[#034C68]' : 'text-slate-700 hover:bg-[#f3f5f4]')}>
                <span className={cn('block text-sm', option.content ? 'whitespace-normal' : 'truncate')}>{option.content ?? option.label}</span>
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
  clients: { id: string; company_name: string; company_profile_image_path?: string | null }[]
  clientImageUrlByPath?: Record<string, string>
  assignees: Option[]
  departments: Department[]
  platforms: Platform[]
  services: Service[]
  meId: string
  onCancel?: () => void
  onSaved?: () => void
  modalLayout?: boolean
}

function ticketRequestSummary(ticket: TicketOption, platforms: Platform[]) {
  const category = TICKET_CATEGORY_BY_VALUE[ticket.category]
  const details = Object.entries(ticket.details ?? {}).flatMap(([key, rawValue]) => {
    const field = category.fields.find(item => item.key === key)
    if (!field || field.type === 'password' || rawValue == null || String(rawValue).trim() === '') return []
    const raw = String(rawValue)
    const value = field.type === 'select'
      ? field.options?.find(option => option.value === raw)?.label ?? raw
      : field.type === 'platform'
        ? platforms.find(platform => platform.id === raw)?.name ?? raw
        : raw
    return [`${field.label}: ${value}`]
  })
  return [category.label, ticket.description, ...details].filter(Boolean).join(' · ')
}

export function TaskForm(p: TaskFormProps) {
  const router = useRouter()
  const t = p.task
  const currentTicketId = t?.ticket_id ?? null
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
    estimated_hours: t?.estimated_hours == null ? (p.mode === 'create' ? '3' : '') : String(t.estimated_hours),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [assigneeError, setAssigneeError] = useState('')
  const [tickets, setTickets] = useState<TicketOption[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [ticketLoadError, setTicketLoadError] = useState('')
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))
  const canEditAssignment = p.canEditAssignment ?? true

  const activePlatforms = useMemo(() => p.platforms.filter(x => x.is_active || x.id === form.platform_id), [p.platforms, form.platform_id])
  const activeServices = useMemo(() => p.services.filter(x => x.is_active || x.id === form.service_id), [p.services, form.service_id])

  // A client can have several tickets — load that client's tickets so a task
  // can be traced back to the specific one it's for, instead of only the client.
  useEffect(() => {
    if (p.modalLayout) {
      setTickets([])
      setTicketLoadError('')
      setLoadingTickets(false)
      return
    }
    if (!form.client_id) {
      setTickets([])
      setTicketLoadError('')
      setLoadingTickets(false)
      return
    }
    let cancelled = false
    setLoadingTickets(true)
    setTicketLoadError('')
    createClient().from('tickets').select('id, ticket_number, subject, status, category, description, details')
      .eq('client_id', form.client_id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setTicketLoadError(errorMessage(error))
          setTickets([])
        } else {
          setTickets(((data ?? []) as TicketOption[]).filter(ticket =>
            ticket.status === 'unassigned' || ticket.id === currentTicketId,
          ))
        }
        setLoadingTickets(false)
      })
    return () => { cancelled = true }
  }, [form.client_id, currentTicketId, p.modalLayout])

  const selectedTicket = tickets.find(ticket => ticket.id === form.ticket_id)

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
    if (files.length > 0) {
      let uploadedCount = 0
      for (const file of files) {
        const safeName = file.name.replace(/[\\/]/g, '_')
        const path = `${data.id}/${crypto.randomUUID()}-${safeName}`
        const { error: storageError } = await supabase.storage.from('task-files').upload(path, file)
        if (storageError) {
          setFiles(files.slice(uploadedCount))
          setError(`Task saved, but "${file.name}" could not be uploaded: ${errorMessage(storageError)}`)
          setSaving(false)
          return
        }
        const { error: attachmentError } = await supabase.from('task_attachments').insert({
          task_id: data.id,
          uploaded_by: p.meId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        if (attachmentError) {
          const { error: cleanupError } = await supabase.storage.from('task-files').remove([path])
          setFiles(files.slice(uploadedCount))
          setError(cleanupError
            ? `Task saved, but "${file.name}" could not be attached: ${errorMessage(attachmentError)} The uploaded file could not be cleaned up.`
            : `Task saved, but "${file.name}" could not be attached: ${errorMessage(attachmentError)}`)
          setSaving(false)
          return
        }
        uploadedCount += 1
      }
    }
    if (p.onSaved) {
      setSaving(false)
      p.onSaved()
      router.refresh()
      return
    }
    router.push(`/tasks/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className={p.modalLayout ? 'flex min-h-0 flex-1 flex-col' : 'content-card space-y-5 p-5 sm:p-6'}>
      <div data-modal-content={p.modalLayout ? '' : undefined} className={p.modalLayout ? 'min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7' : ''}>
      <TaskFormCard enabled={!!p.modalLayout}>
      {p.modalLayout && <TaskFormCardTitle />}
      {p.mode === 'create' && <h1 className="text-2xl font-bold text-slate-900">Create New Task</h1>}
      {error && <Alert>{error}</Alert>}

      {p.modalLayout ? (
        <TaskBasicInformation
          idPrefix="edit-task"
          title={form.title}
          description={form.description}
          onTitleChange={title => set('title', title)}
          onDescriptionChange={description => set('description', description)}
          files={files}
          onFilesChange={setFiles}
          onRemoveFile={index => setFiles(current => current.filter((_, fileIndex) => fileIndex !== index))}
          titlePlaceholder="Enter task title"
        />
      ) : (
        <>
          <Field label="Title" required>
            <input className="form-field" required value={form.title} onChange={e => set('title', e.target.value)}
                   placeholder="e.g. Launch Diwali sponsored ads on Amazon" autoFocus={p.mode === 'create'} />
          </Field>
          <Field label="Description">
            <textarea className="form-field min-h-[110px]" value={form.description} onChange={e => set('description', e.target.value)}
                      placeholder="Details, links, marketplace case IDs…" />
          </Field>
        </>
      )}

      {p.modalLayout && <TaskSectionHeader section="configuration" />}
      {!p.modalLayout && <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" required hint={p.clients.length === 0 ? 'No clients have active tickets' : undefined}>
          <FormSelect label="Select client…" value={form.client_id}
            className={p.modalLayout ? 'h-9 rounded-xl text-sm' : undefined}
            options={[
              { value: '', label: 'Select client…' },
              ...p.clients.map(client => ({
                value: client.id,
                label: client.company_name,
                selectedContent: client.company_name,
                content: (
                  <span className="flex items-center gap-2">
                    <CompanyAvatar
                      name={client.company_name}
                      src={client.company_profile_image_path ? p.clientImageUrlByPath?.[client.company_profile_image_path] : null}
                      size="xs"
                    />
                    <span className="break-words">{client.company_name}</span>
                  </span>
                ),
              })),
            ]}
            onChange={pickClient} required aria-label="Client" />
        </Field>
        <Field label="Ticket"
               hint={!form.client_id ? 'Pick a client first' : loadingTickets ? 'Loading…' : ticketLoadError || (selectedTicket ? ticketRequestSummary(selectedTicket, p.platforms) : tickets.length === 0 ? 'No unassigned tickets for this client' : 'Links this task back to the request it\'s for')}>
          <FormSelect label="No ticket (standalone task)" value={form.ticket_id} disabled={!form.client_id || loadingTickets}
            className={p.modalLayout ? 'h-9 rounded-xl text-sm' : undefined}
            options={[{ value: '', label: 'No ticket (standalone task)' }, ...tickets.map(tk => ({
              value: tk.id,
              label: `${ticketCode(tk.ticket_number)} · ${tk.subject}${tk.status === 'closed' ? ` (${TICKET_STATUS_LABELS[tk.status]})` : ''}`,
              detail: ticketRequestSummary(tk, p.platforms).slice(0, 180),
            }))]}
            onChange={value => set('ticket_id', value)} aria-label="Ticket" />
        </Field>
      </div>
      }

      <TaskFieldsGrid columns="four" modal={!!p.modalLayout}>
        <Field label="Type">
          <FormSelect label="Type" value={form.type} options={TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            className={p.modalLayout ? 'h-9 rounded-xl text-sm' : undefined}
            native={p.modalLayout}
            onChange={value => set('type', value as TaskType)} aria-label="Type" />
        </Field>
        <Field label="Service">
          <FormSelect label="—" value={form.service_id} options={[{ value: '', label: '—' }, ...activeServices.map(s => ({ value: s.id, label: s.name }))]}
            className={p.modalLayout ? 'h-9 rounded-xl text-sm' : undefined}
            native={p.modalLayout}
            onChange={pickService} aria-label="Service" />
        </Field>
        <Field label="Department">
          <FormSelect label="—" value={form.department_id} options={[{ value: '', label: '—' }, ...p.departments.map(d => ({ value: d.id, label: d.name }))]}
            className={p.modalLayout ? 'h-9 text-sm' : undefined}
            native={p.modalLayout}
            onChange={value => set('department_id', value)} aria-label="Department" />
        </Field>
        <Field label="Platform">
          <MarketplacePlatformSelect
            platforms={activePlatforms}
            value={form.platform_id}
            placeholder="—"
            className={p.modalLayout
              ? 'form-field flex h-9 w-full items-center justify-between gap-2 text-sm'
              : undefined}
            onChange={value => set('platform_id', value)}
          />
        </Field>
      </TaskFieldsGrid>

      <TaskFieldsGrid columns="three" modal={!!p.modalLayout}>
        <Field label="Assignee" required={p.mode === 'create'}
               hint={!canEditAssignment ? 'Only managers can change the assignee.' : p.assignees.length === 1 ? 'You can assign tasks to yourself.' : undefined}>
          <div className="relative" data-assignee-picker>
            <button type="button" className={cn('form-field flex w-full items-center justify-between text-left', p.modalLayout && 'h-9 rounded-xl text-sm')}
                    disabled={!canEditAssignment} aria-haspopup="listbox" aria-expanded={assigneeOpen}
                    aria-required={p.mode === 'create'} aria-invalid={!!assigneeError}
                    onClick={() => setAssigneeOpen(open => !open)}>
              <span className="flex min-w-0 items-center gap-2">
                {form.assignee_id
                  ? (() => {
              const selected = p.assignees.find(a => a.id === form.assignee_id)
              return selected ? <><span className="relative h-5 w-5 shrink-0"><Avatar name={selected.name} src={selected.avatarUrl} role={selected.avatarRole} size="xs" className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-xs" /></span><span className="truncate">{selected.name}{selected.id === p.meId ? ' (me)' : ''}</span></> : 'Select assignee…'
                    })()
                  : 'Select assignee…'}
              </span>
              <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
            </button>
            {assigneeOpen && (
              <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Assigned to</p>
                <div role="listbox" aria-label="Assigned to" className="max-h-64 space-y-1 overflow-y-auto">
                  {p.assignees.map(a => {
                    const selected = form.assignee_id === a.id
                    return (
                      <button key={a.id} type="button" role="option" aria-selected={selected}
                              onClick={() => { set('assignee_id', a.id); setAssigneeError(''); setAssigneeOpen(false) }}
                              className={cn('w-full rounded-lg px-3 py-2 text-left transition-colors', selected ? 'bg-[#EAF4F8] font-medium text-[#034C68]' : 'hover:bg-[#f3f5f4]')}>
                        <AssigneeOptionContent
                          name={a.name}
                          avatarUrl={a.avatarUrl}
                          avatarRole={a.avatarRole}
                          roleLabel={a.role}
                          isMe={a.id === p.meId}
                        />
                      </button>
                    )
                  })}
                </div>
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
            className={p.modalLayout ? 'h-9 rounded-xl text-sm' : undefined}
            native={p.modalLayout}
            onChange={value => set('priority', value as TaskPriority)} aria-label="Priority" />
        </Field>
        <Field label="Estimated hours">
          <input className={cn('form-field', p.modalLayout && 'h-9 rounded-xl text-sm')} type="number" min="0" step="0.5" value={form.estimated_hours} placeholder="Enter hours" onChange={e => set('estimated_hours', e.target.value)} />
        </Field>
      </TaskFieldsGrid>

      {p.modalLayout && <TaskSectionHeader section="deadline" />}
      <div>
        {!p.modalLayout && <label className="form-field-label">Deadline</label>}
        {!canEditAssignment && <p className="mb-1 text-xs text-slate-500">Only managers can change the due date.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {DEADLINE_OPTIONS.map(d => (
            <button key={d.value} type="button" disabled={!canEditAssignment} onClick={() => pickDeadline(d.value)}
                    className={cn('rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-50',
                      p.modalLayout && 'inline-flex h-7 items-center rounded-full px-3 text-xs',
                      form.deadline_type === d.value ? 'bg-[#045E80] text-white ring-[#045E80]' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
              {d.label}
            </button>
          ))}
          <input type="date" className={cn('form-field task-deadline-date', p.modalLayout && 'h-7 rounded-full px-3 py-1 text-xs leading-4')} value={form.due_date} disabled={!canEditAssignment}
                 onChange={e => setForm(f => ({ ...f, due_date: e.target.value, deadline_type: '' }))} />
        </div>
      </div>

      {p.canMarkUrgent && (
        <label className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition',
          !p.modalLayout && 'task-urgent-toggle',
          p.modalLayout && 'mt-3 border-0 p-0',
          form.is_urgent ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50')}>
          <input type="checkbox" checked={form.is_urgent} onChange={e => set('is_urgent', e.target.checked)}
                 className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
          <Flame className={cn('h-5 w-5', form.is_urgent ? 'text-red-600' : 'text-slate-400')} />
          <span className="text-sm">
            <span className="font-semibold text-slate-900">Mark as urgent</span>
            {!p.modalLayout && <span className="block text-slate-500">Everyone on the team will see it in the urgent pool and can pick it up.</span>}
          </span>
        </label>
      )}
      </TaskFormCard>
      </div>

      <div data-modal-footer={p.modalLayout ? '' : undefined} className={cn('flex items-center justify-between gap-3 border-t border-slate-100 pt-5', p.modalLayout && 'flex-shrink-0 border-slate-200 bg-white px-6 py-4 sm:px-7')}>
        {p.modalLayout && <p className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><Info aria-hidden="true" className="h-4 w-4 shrink-0" />This task stays linked to its current ticket.</p>}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="secondary" size={p.modalLayout ? 'lg' : 'md'} className={p.modalLayout ? 'rounded-xl' : undefined}
                  onClick={() => p.onCancel ? p.onCancel() : router.back()}>Cancel</Button>
          <Button type="submit" size={p.modalLayout ? 'lg' : 'md'} className={p.modalLayout ? 'rounded-xl bg-[#045E80] shadow-md hover:bg-[#034C68]' : undefined}
                  loading={saving}>{p.modalLayout && !saving && <Check className="h-4 w-4" />}{p.mode === 'create' ? 'Create task' : 'Save changes'}</Button>
        </div>
      </div>
    </form>
  )
}
