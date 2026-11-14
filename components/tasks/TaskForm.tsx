'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Flame, Globe2, Info, LockKeyhole, X } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Avatar, CompanyAvatar, Field } from '@/components/ui/primitives'
import { TaskBasicInformation } from '@/components/tasks/TaskBasicInformation'
import { AssigneeOptionContent } from '@/components/tasks/AssigneeOptionContent'
import { TaskFieldsGrid, TaskFormCard, TaskFormCardTitle, TaskSectionHeader } from '@/components/tasks/TaskFormSections'
import { MarketplacePlatformSelect } from '@/components/shared/Marketplace'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { AttachmentPicker } from '@/components/shared/AttachmentPicker'
import { DEADLINE_OPTIONS, PRIORITY_OPTIONS, TICKET_STATUS_LABELS, TYPE_OPTIONS } from '@/lib/constants'
import { TICKET_CATEGORY_BY_VALUE } from '@/lib/ticket-categories'
import { cn, dueDateFor, errorMessage, ticketCode } from '@/lib/utils'
import type { AppRole, Department, DeadlineType, Platform, Service, Task, TaskPriority, TaskType, TaskVisibility, TicketStatus } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

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
type ScheduleTimeParts = { hour: string; minute: string; period: 'AM' | 'PM' | '' }
const STANDALONE_TICKET_OPTION = '__standalone__'

function FormSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  invalid = false,
  required = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
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
  'aria-describedby'?: string
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
                        aria-describedby={ariaDescribedBy}
                        aria-required={required} aria-invalid={invalid} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </SearchableSelect>
    )
  }

  return (
    <div className="relative" data-form-select>
      <button type="button" className={cn('form-field flex w-full items-center justify-between text-left', className, invalid && 'border-red-400 focus:border-red-500 focus:ring-red-200')}
              disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
              aria-describedby={ariaDescribedBy} aria-required={required} aria-invalid={invalid}
              onClick={() => setOpen(current => !current)}>
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
  /** false when an employee is editing a task that's already assigned — only managers can then change assignee/due date. */
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
  const runOnce = useSingleFlight()
  const t = p.task
  const currentTicketId = t?.ticket_id ?? null
  const [form, setForm] = useState({
    title:           t?.title ?? '',
    description:     t?.description ?? '',
    client_id:       t?.visibility === 'private' ? '' : t?.client_id ?? p.defaultClientId ?? '',
    visibility:      (t?.visibility ?? '') as TaskVisibility | '',
    type:            (t?.type ?? 'task') as TaskType,
    priority:        (t?.priority ?? 'P3') as TaskPriority,
    is_urgent:       t?.is_urgent ?? false,
    service_id:      t?.service_id ?? '',
    department_id:   t?.department_id ?? '',
    platform_id:     t?.platform_id ?? '',
    assignee_id:     t?.assignee_id
                     ?? (p.defaultAssigneeId && p.assignees.some(a => a.id === p.defaultAssigneeId) ? p.defaultAssigneeId : null)
                     ?? (p.mode === 'create' && p.assignees.length === 1 ? p.meId : ''),
    ticket_id:       t?.ticket_id ?? (p.mode === 'edit' ? STANDALONE_TICKET_OPTION : ''),
    due_date:        t?.due_date ?? '',
    deadline_type:   (t?.deadline_type ?? '') as DeadlineType | '',
    estimated_hours: t?.estimated_hours == null ? '' : String(t.estimated_hours),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [titleError, setTitleError] = useState('')
  const [clientError, setClientError] = useState('')
  const [ticketError, setTicketError] = useState('')
  const [assigneeError, setAssigneeError] = useState('')
  const [deadlineError, setDeadlineError] = useState('')
  const [fileError, setFileError] = useState('')
  const [tickets, setTickets] = useState<TicketOption[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [ticketLoadError, setTicketLoadError] = useState('')
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleRepeat, setScheduleRepeat] = useState('')
  const [scheduleCustomDays, setScheduleCustomDays] = useState('2')
  const [scheduleCustomInputOpen, setScheduleCustomInputOpen] = useState(false)
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleTimeParts, setScheduleTimeParts] = useState<ScheduleTimeParts>({ hour: '', minute: '', period: '' })
  const [scheduleTimePickerOpen, setScheduleTimePickerOpen] = useState(false)
  const scheduleTimePickerRef = useRef<HTMLDivElement | null>(null)
  const [scheduleStartDate, setScheduleStartDate] = useState('')
  const [scheduleCalendarOpen, setScheduleCalendarOpen] = useState(false)
  const [scheduleCalendarMonth, setScheduleCalendarMonth] = useState<Date | null>(null)
  const [scheduleCalendarAbove, setScheduleCalendarAbove] = useState(false)
  const scheduleCalendarRef = useRef<HTMLDivElement | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))
  const canEditAssignment = p.canEditAssignment ?? true
  const deadlineRequired = p.mode === 'create' || canEditAssignment
  const ticketLinked = Boolean(form.ticket_id) && form.ticket_id !== STANDALONE_TICKET_OPTION
  const standaloneSelected = form.ticket_id === STANDALONE_TICKET_OPTION
  const visibilityLocked = p.mode === 'edit' || !standaloneSelected || ticketLinked
  const selectedSchedulerDate = scheduleStartDate ? new Date(`${scheduleStartDate}T12:00:00`) : null
  const scheduleCalendarDays = scheduleCalendarMonth
    ? eachDayOfInterval({
        start: startOfWeek(startOfMonth(scheduleCalendarMonth)),
        end: endOfWeek(endOfMonth(scheduleCalendarMonth)),
      })
    : []

  useEffect(() => {
    if (!scheduleCalendarOpen) return
    const updateCalendarPlacement = () => {
      const bounds = scheduleCalendarRef.current?.getBoundingClientRect()
      if (!bounds) return
      const spaceAbove = bounds.top - 8
      const spaceBelow = window.innerHeight - bounds.bottom - 8
      setScheduleCalendarAbove(spaceBelow < 380 && spaceAbove > 300)
    }
    function closeDatePicker(event: PointerEvent) {
      if (event.target instanceof Node && !scheduleCalendarRef.current?.contains(event.target)) {
        setScheduleCalendarOpen(false)
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setScheduleCalendarOpen(false)
    }
    updateCalendarPlacement()
    document.addEventListener('pointerdown', closeDatePicker)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', updateCalendarPlacement)
    window.addEventListener('scroll', updateCalendarPlacement, true)
    return () => {
      document.removeEventListener('pointerdown', closeDatePicker)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', updateCalendarPlacement)
      window.removeEventListener('scroll', updateCalendarPlacement, true)
    }
  }, [scheduleCalendarOpen])

  useEffect(() => {
    if (!scheduleTimePickerOpen) return
    function closeTimePicker(event: PointerEvent) {
      if (event.target instanceof Node && !scheduleTimePickerRef.current?.contains(event.target)) {
        setScheduleTimePickerOpen(false)
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setScheduleTimePickerOpen(false)
    }
    document.addEventListener('pointerdown', closeTimePicker)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeTimePicker)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [scheduleTimePickerOpen])

  function chooseScheduleTimePart(key: keyof ScheduleTimeParts, value: string) {
    const next = { ...scheduleTimeParts, [key]: value } as ScheduleTimeParts
    setScheduleTimeParts(next)
    if (next.hour && next.minute && next.period) {
      const hour24 = (Number(next.hour) % 12) + (next.period === 'PM' ? 12 : 0)
      setScheduleTime(`${String(hour24).padStart(2, '0')}:${next.minute}`)
    }
  }

  function openScheduleTimePicker() {
    if (scheduleTime) {
      const [hour, minute] = scheduleTime.split(':').map(Number)
      setScheduleTimeParts({
        hour: String(hour % 12 || 12),
        minute: String(minute).padStart(2, '0'),
        period: hour >= 12 ? 'PM' : 'AM',
      })
    } else {
      setScheduleTimeParts({ hour: '', minute: '', period: '' })
    }
    setScheduleTimePickerOpen(true)
  }

  function formatSelectedScheduleTime() {
    if (!scheduleTime) return ''
    const [hour, minute] = scheduleTime.split(':').map(Number)
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
  }

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
    if (form.visibility === 'private') return
    setClientError('')
    // The previously picked ticket almost certainly belonged to the old client.
    setForm(f => ({
      ...f,
      client_id: clientId,
      ticket_id: ticketLinked ? '' : f.ticket_id,
    }))
  }

  function pickVisibility(visibility: TaskVisibility) {
    setClientError('')
    setForm(f => ({
      ...f,
      visibility,
      ...(visibility === 'private' ? { client_id: '' } : {}),
    }))
  }

  function pickTicket(ticketId: string) {
    setClientError('')
    setTicketError('')
    setForm(f => ({
      ...f,
      ticket_id: ticketId,
      visibility: '',
    }))
  }

  function pickService(id: string) {
    const svc = p.services.find(s => s.id === id)
    setForm(f => ({ ...f, service_id: id, department_id: svc?.department_id ?? f.department_id }))
  }

  function pickDeadline(type: DeadlineType) {
    setDeadlineError('')
    setForm(f => f.deadline_type === type
      ? { ...f, deadline_type: '', due_date: '' }
      : { ...f, deadline_type: type, due_date: dueDateFor(type) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const titleMissing = !form.title.trim()
    setTitleError(titleMissing ? 'Enter a task title.' : '')
    const assigneeMissing = p.mode === 'create' && !form.assignee_id
    setAssigneeError(assigneeMissing ? 'Please select an assignee before creating the task.' : '')
    const ticketMissing = !form.ticket_id
    setTicketError(ticketMissing ? 'Select a ticket or choose No ticket (standalone).' : '')
    const visibilityMissing = standaloneSelected && !form.visibility
    const deadlineMissing = deadlineRequired && !form.due_date
    setDeadlineError(deadlineMissing ? 'Please select a deadline before saving the task.' : '')
    const clientMissing = ((standaloneSelected && form.visibility === 'public') || ticketLinked) && !form.client_id
    if (clientMissing) {
      setClientError(standaloneSelected
        ? 'Please select a client before creating this public task.'
        : 'Please select a client for the selected ticket.')
      setError('')
    } else {
      setClientError('')
    }
    setError(visibilityMissing ? 'Choose Public or Private task visibility.' : '')
    if (titleMissing || assigneeMissing || clientMissing || deadlineMissing || ticketMissing || visibilityMissing) {
      if (titleMissing) document.getElementById(p.modalLayout ? 'edit-task-title' : 'create-task-title')?.focus()
      else if (ticketMissing) document.querySelector<HTMLButtonElement>('[aria-label="Ticket"]')?.focus()
      else if (clientMissing) document.querySelector<HTMLButtonElement>('[aria-label="Client"]')?.focus()
      else if (deadlineMissing) document.getElementById('task-deadline-date')?.focus()
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      title:           form.title.trim(),
      description:     form.description.trim() || null,
      client_id:       form.client_id || null,
      ticket_id:       ticketLinked ? form.ticket_id : null,
      visibility:      ticketLinked ? 'public' : form.visibility,
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
    <form noValidate onSubmit={event => void runOnce('submit', () => handleSubmit(event))} className={p.modalLayout ? 'flex min-h-0 flex-1 flex-col' : 'content-card space-y-5 p-5 sm:p-6'}>
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
          titleError={titleError}
          onTitleChange={title => {
            set('title', title)
            if (title.trim()) setTitleError('')
          }}
          onDescriptionChange={description => set('description', description)}
          files={files}
          onFilesChange={setFiles}
          onRemoveFile={index => setFiles(current => current.filter((_, fileIndex) => fileIndex !== index))}
          titlePlaceholder="Enter task title"
        />
      ) : (
        <>
          <Field label="Title" required>
            <input
                   id="create-task-title"
                   aria-invalid={Boolean(titleError)}
                   aria-describedby={titleError ? 'create-task-title-error' : undefined}
                   className={cn('form-field', titleError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
                   value={form.title}
                   onChange={e => {
                     set('title', e.target.value)
                     if (e.target.value.trim()) setTitleError('')
                   }}
                   placeholder="e.g. Launch Diwali sponsored ads on Amazon" autoFocus={p.mode === 'create'} />
            {titleError && <p id="create-task-title-error" role="alert" className="mt-1 text-xs font-medium text-red-600">{titleError}</p>}
          </Field>
          <Field label="Description">
            <textarea className="form-field min-h-[110px] w-full" value={form.description} onChange={e => set('description', e.target.value)}
                      placeholder="Details, links, marketplace case IDs…" />
          </Field>
        </>
      )}

      {p.modalLayout && <TaskSectionHeader section="configuration" />}
      {!p.modalLayout && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.25fr)_minmax(150px,0.45fr)]">
        <Field label="Client" required={(standaloneSelected && form.visibility === 'public') || ticketLinked}
          error={clientError} errorId="task-client-error" hint={form.visibility === 'private'
          ? 'Private tasks cannot be associated with a client.'
          : form.visibility === 'public' && standaloneSelected
            ? 'Required for public tasks.'
            : ticketLinked
              ? 'Required for ticket-linked tasks.'
              : p.clients.length === 0 ? 'No clients available' : 'Choose a client for public tasks.'}>
          <FormSelect label="Select client…" value={form.client_id} disabled={form.visibility === 'private'}
            invalid={!!clientError} required={(standaloneSelected && form.visibility === 'public') || ticketLinked}
            aria-describedby={clientError ? 'task-client-error' : undefined}
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
            onChange={pickClient} aria-label="Client" />
        </Field>
        <Field label="Ticket" error={ticketError} errorId="task-ticket-error"
               hint={!ticketError
                 ? !form.client_id ? 'Client is optional for private standalone tasks.' : loadingTickets ? 'Loading…' : ticketLoadError || (selectedTicket ? ticketRequestSummary(selectedTicket, p.platforms) : 'Choose a ticket or explicitly select No ticket (standalone)')
                 : undefined}>
          <FormSelect label="Select ticket or standalone…" value={form.ticket_id} disabled={loadingTickets || (p.mode === 'edit' && t?.visibility === 'private')}
            invalid={!!ticketError} aria-describedby={ticketError ? 'task-ticket-error' : undefined}
            className={p.modalLayout ? 'h-9 rounded-xl text-sm' : undefined}
            options={[
              { value: '', label: 'Select ticket or standalone…' },
              { value: STANDALONE_TICKET_OPTION, label: 'No ticket (standalone)' },
              ...tickets.map(tk => ({
              value: tk.id,
              label: `${ticketCode(tk.ticket_number)} · ${tk.subject}${tk.status === 'closed' ? ` (${TICKET_STATUS_LABELS[tk.status]})` : ''}`,
              detail: ticketRequestSummary(tk, p.platforms).slice(0, 180),
            }))]}
            onChange={pickTicket} aria-label="Ticket" />
        </Field>
        <Field label="Attach files" className="sm:col-span-2 lg:col-span-1">
          <div className="flex h-9 items-center gap-2">
            <AttachmentPicker
              disabled={saving}
              fullWidth
              buttonLabel={files.length > 0 ? `${files.length} selected` : 'Choose files'}
              buttonClassName="border border-slate-300 text-slate-600 hover:bg-slate-50"
              onFilesSelected={(accepted, rejected) => {
                setFileError(rejected.length
                  ? `GIF, audio, and unsupported file types cannot be attached: ${rejected.map(file => file.name).join(', ')}`
                  : '')
                if (accepted.length) setFiles(current => [...current, ...accepted])
              }}
            />
          </div>
        </Field>
        {(files.length > 0 || fileError) && (
          <div className="sm:col-span-2 lg:col-span-3">
            {fileError && <p role="alert" className="mb-2 text-xs text-red-600">{fileError}</p>}
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
                    <span className="max-w-56 truncate" title={file.name}>{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      disabled={saving}
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                      onClick={() => setFiles(current => current.filter((_, fileIndex) => fileIndex !== index))}
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
            <button type="button" className={cn(
              'form-field flex w-full items-center justify-between text-left',
              p.modalLayout && 'h-9 rounded-xl text-sm',
              assigneeError && 'border-red-400 focus:border-red-500',
            )}
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

      {!p.modalLayout && (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section aria-labelledby="task-visibility-label">
            <div className="grid max-w-[26rem] gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <h2 id="task-visibility-label" className="text-sm font-semibold text-slate-800">Task visibility</h2>
                <p className="mt-0.5 text-xs leading-4 text-slate-500">
                  {ticketLinked
                    ? 'Ticket tasks remain client-visible.'
                    : !standaloneSelected
                      ? 'Choose No ticket (standalone) to set visibility.'
                    : p.mode === 'edit'
                      ? 'Set when task was created.'
                      : 'Choose who can see this task.'}
                </p>
              </div>
              {([
                { value: 'public', title: 'Public', description: 'Client + authorized staff' },
                { value: 'private', title: 'Private', description: 'Authorized staff only' },
              ] as const).map(option => {
                const selected = !visibilityLocked && form.visibility === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={visibilityLocked}
                    onClick={() => pickVisibility(option.value)}
                    className={cn(
                      'flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                      selected ? 'border-[#045E80] bg-[#EAF4F8] ring-1 ring-inset ring-[#045E80]' : 'border-slate-300 bg-white hover:bg-slate-50',
                      visibilityLocked && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      selected ? 'bg-[#CFE6EF] text-[#034C68]' : 'bg-slate-100 text-slate-600')}>
                      {option.value === 'public' ? <Globe2 aria-hidden="true" className="h-4 w-4" /> : <LockKeyhole aria-hidden="true" className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-900">{option.title}</span>
                      <span className="block whitespace-nowrap text-[10px] leading-4 text-slate-500">{option.description}</span>
                    </span>
                    <span aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 rounded-full border',
                      selected ? 'border-[#045E80] bg-[#045E80] shadow-[inset_0_0_0_3px_white]' : 'border-slate-300')} />
                  </button>
                )
              })}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" aria-labelledby="task-scheduler-label">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <CalendarDays aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#045E80]" />
                <div>
                  <h2 id="task-scheduler-label" className="text-sm font-semibold text-slate-800">Task Scheduler</h2>
                  <p className="mt-0.5 text-xs leading-4 text-slate-500">Automatically create and assign this task.</p>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={event => setScheduleEnabled(event.target.checked)}
                  className="peer sr-only"
                />
                <span>Enable Schedule</span>
                <span aria-hidden="true" className={cn(
                  'relative h-6 w-10 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-[#045E80] peer-focus-visible:ring-offset-2',
                  scheduleEnabled ? 'bg-[#045E80] after:translate-x-4' : 'bg-slate-300 after:translate-x-0',
                )} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)_minmax(0,1fr)]">
              <div className="order-2 block text-xs font-medium text-slate-600">
                Repeat
                <SearchableSelect
                  value={scheduleRepeat}
                  onChange={event => {
                    const nextRepeat = event.target.value
                    setScheduleRepeat(nextRepeat)
                    setScheduleCustomDays(nextRepeat === 'custom' ? '2' : '')
                    setScheduleCustomInputOpen(nextRepeat === 'custom')
                  }}
                  onClose={() => {
                    if (scheduleCustomInputOpen && (!scheduleCustomDays || Number(scheduleCustomDays) < 2)) {
                      setScheduleRepeat('')
                      setScheduleCustomDays('')
                      setScheduleCustomInputOpen(false)
                    }
                  }}
                  disabled={!scheduleEnabled}
                  aria-label="Repeat schedule"
                  placeholder="Select schedule"
                  dropdownMinWidth={200}
                  dropdownMaxHeight={250}
                  denseOptions
                  hideChevron
                  options={[
                    { value: '', text: 'Select schedule', label: 'Select schedule' },
                    { value: 'daily', text: 'Daily', label: 'Daily' },
                    { value: 'weekly', text: 'For a week', label: 'For a week' },
                    { value: 'custom', text: 'Custom', label: 'Custom', selectedLabel: scheduleCustomDays
                      ? <span>{scheduleCustomDays} day</span>
                      : <span>Custom</span> },
                  ]}
                  keepOpenOnSelect={value => value === 'custom'}
                  dropdownFooter={scheduleCustomInputOpen ? (
                    <div>
                      <label htmlFor="task-schedule-custom-days" className="mb-1 block text-xs font-medium text-slate-600">Repeat every</label>
                      <div className="flex h-9 items-center overflow-hidden rounded-lg">
                        <input
                          id="task-schedule-custom-days"
                          type="number"
                          min={2}
                          step={1}
                          disabled={!scheduleEnabled}
                          value={scheduleCustomDays}
                          onChange={event => {
                            const days = event.target.value
                            if (!days) {
                              setScheduleCustomDays('')
                              setScheduleRepeat('custom')
                              return
                            }
                            if (!/^\d+$/.test(days) || Number(days) < 2) {
                              setScheduleCustomDays('')
                              setScheduleRepeat('custom')
                              return
                            }
                            setScheduleCustomDays(days)
                            setScheduleRepeat('custom')
                          }}
                          aria-label="Repeat every number of days"
                          className="form-field h-9 min-w-0 flex-1 rounded-r-none"
                        />
                        <span className="flex h-9 items-center border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">day</span>
                      </div>
                    </div>
                  ) : undefined}
                  className="mt-1"
                />
              </div>
              <div className="order-3 relative block text-xs font-medium text-slate-600" ref={scheduleTimePickerRef}>
                <span className="block">Time</span>
                <button
                  type="button"
                  disabled={!scheduleEnabled}
                  aria-label={scheduleTime ? `Schedule time ${formatSelectedScheduleTime()}` : 'Select schedule time'}
                  aria-haspopup="dialog"
                  aria-expanded={scheduleTimePickerOpen}
                  onClick={() => scheduleTimePickerOpen ? setScheduleTimePickerOpen(false) : openScheduleTimePicker()}
                  className="form-field mt-1 flex h-9 w-full items-center gap-2 text-left text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <Clock3 aria-hidden="true" className={cn('h-4 w-4 shrink-0', scheduleEnabled ? 'text-[#045E80]' : 'text-slate-400')} />
                  <span className={cn('min-w-0 flex-1 truncate', !scheduleTime && (scheduleEnabled ? 'text-slate-900' : 'text-slate-500'))}>
                    {scheduleTime ? formatSelectedScheduleTime() : 'Select time'}
                  </span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                </button>
                {scheduleTimePickerOpen && (
                  <div role="dialog" aria-label="Choose schedule time" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-800">Choose time</h3>
                      <button type="button" aria-label="Close time picker" onClick={() => setScheduleTimePickerOpen(false)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                        <X aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <div>
                        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hour</p>
                        <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1">
                          {Array.from({ length: 12 }, (_, index) => String(index + 1)).map(hour => (
                            <button key={hour} type="button" aria-pressed={scheduleTimeParts.hour === hour}
                              onClick={() => chooseScheduleTimePart('hour', hour)}
                              className={cn('h-8 w-full rounded-md text-sm transition-colors', scheduleTimeParts.hour === hour ? 'bg-[#045E80] font-semibold text-white' : 'text-slate-700 hover:bg-[#EAF4F8] hover:text-[#034C68]')}>
                              {hour}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Minute</p>
                        <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1">
                          {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map(minute => (
                            <button key={minute} type="button" aria-pressed={scheduleTimeParts.minute === minute}
                              onClick={() => chooseScheduleTimePart('minute', minute)}
                              className={cn('h-8 w-full rounded-md text-sm transition-colors', scheduleTimeParts.minute === minute ? 'bg-[#045E80] font-semibold text-white' : 'text-slate-700 hover:bg-[#EAF4F8] hover:text-[#034C68]')}>
                              {minute}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Period</p>
                        <div className="space-y-1 rounded-lg bg-slate-50 p-1">
                          {(['AM', 'PM'] as const).map(period => (
                            <button key={period} type="button" aria-pressed={scheduleTimeParts.period === period}
                              onClick={() => chooseScheduleTimePart('period', period)}
                              className={cn('h-8 w-12 rounded-md px-2 text-sm transition-colors', scheduleTimeParts.period === period ? 'bg-[#045E80] font-semibold text-white' : 'text-slate-700 hover:bg-[#EAF4F8] hover:text-[#034C68]')}>
                              {period}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                      <button type="button" onClick={() => {
                        setScheduleTime('')
                        setScheduleTimeParts({ hour: '', minute: '', period: '' })
                      }} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
                        Clear
                      </button>
                      <button type="button" disabled={!scheduleTime} onClick={() => setScheduleTimePickerOpen(false)}
                        className="rounded-md bg-[#045E80] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#034C68] disabled:cursor-not-allowed disabled:opacity-50">
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="order-1 relative block text-xs font-medium text-slate-600" ref={scheduleCalendarRef}>
                <span className="block">Start date</span>
                <button
                  type="button"
                  disabled={!scheduleEnabled}
                  aria-label="Schedule start date"
                  aria-haspopup="dialog"
                  aria-expanded={scheduleCalendarOpen}
                  onClick={() => {
                    if (!scheduleCalendarOpen) {
                      const initialMonth = selectedSchedulerDate ?? new Date()
                      setScheduleCalendarMonth(startOfMonth(initialMonth))
                    }
                    setScheduleCalendarOpen(open => !open)
                  }}
                  className="form-field mt-1 flex h-9 w-full items-center gap-2 text-left text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <CalendarDays aria-hidden="true" className={cn('h-4 w-4 shrink-0', scheduleEnabled ? 'text-[#045E80]' : 'text-slate-400')} />
                  <span className={cn(
                    'min-w-0 flex-1 truncate',
                    !selectedSchedulerDate && (scheduleEnabled ? 'text-slate-900' : 'text-slate-500'),
                  )}>
                    {selectedSchedulerDate ? format(selectedSchedulerDate, 'dd-MMM-yyyy') : 'dd-mm-yyyy'}
                  </span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                </button>
                {scheduleCalendarOpen && scheduleCalendarMonth && (
                  <div role="dialog" aria-label="Choose schedule start date" className={cn(
                    'absolute right-0 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5',
                    scheduleCalendarAbove ? 'bottom-full mb-2' : 'top-full mt-2',
                  )}>
                    <div className="mb-2 flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        aria-label="Previous month"
                        onClick={() => setScheduleCalendarMonth(month => month ? subMonths(month, 1) : month)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#045E80] text-white transition hover:bg-[#034C68]"
                      >
                        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <label className="sr-only" htmlFor="task-schedule-calendar-month">Calendar month</label>
                        <SearchableSelect
                          aria-label="Calendar month"
                          value={String(scheduleCalendarMonth.getMonth())}
                          onChange={event => setScheduleCalendarMonth(month => month ? new Date(month.getFullYear(), Number(event.target.value), 1) : month)}
                          dropdownMinWidth={160}
                          dropdownHeading="Month"
                          dropdownHeadingDivider
                          dropdownMaxHeight={220}
                          denseOptions
                          hideChevron
                          className="!h-8 !w-[7.25rem] !rounded-lg !px-2 !text-xs"
                        >
                          {Array.from({ length: 12 }, (_, month) => (
                            <option key={month} value={String(month)}>{format(new Date(2020, month, 1), 'MMMM')}</option>
                          ))}
                        </SearchableSelect>
                        <SearchableSelect
                          aria-label="Calendar year"
                          value={String(scheduleCalendarMonth.getFullYear())}
                          onChange={event => setScheduleCalendarMonth(month => month ? new Date(Number(event.target.value), month.getMonth(), 1) : month)}
                          dropdownMinWidth={112}
                          dropdownHeading="Year"
                          dropdownHeadingDivider
                          dropdownMaxHeight={220}
                          denseOptions
                          hideChevron
                          className="!h-8 !w-[5rem] !rounded-lg !px-2 !text-xs"
                        >
                          {Array.from({ length: new Date().getFullYear() - 1999 + 20 }, (_, index) => 2000 + index).map(year => (
                            <option key={year} value={String(year)}>{year}</option>
                          ))}
                        </SearchableSelect>
                      </div>
                      <button
                        type="button"
                        aria-label="Next month"
                        onClick={() => setScheduleCalendarMonth(month => month ? addMonths(month, 1) : month)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#045E80] text-white transition hover:bg-[#034C68]"
                      >
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden="true">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, index) => <span key={`${day}-${index}`} className="py-0.5">{day}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-y-0.5">
                      {scheduleCalendarDays.map(day => {
                        const selected = selectedSchedulerDate ? isSameDay(day, selectedSchedulerDate) : false
                        const inMonth = isSameMonth(day, scheduleCalendarMonth)
                        const today = isToday(day)
                        const isPastDate = format(day, 'yyyy-MM-dd') < format(new Date(), 'yyyy-MM-dd')
                        return (
                          <button
                            key={format(day, 'yyyy-MM-dd')}
                            type="button"
                            aria-label={format(day, 'EEEE, d MMMM yyyy')}
                            aria-pressed={selected}
                            disabled={isPastDate}
                            onClick={() => {
                              setScheduleStartDate(format(day, 'yyyy-MM-dd'))
                              setScheduleCalendarOpen(false)
                            }}
                            className={cn(
                              'mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-colors',
                              selected
                                ? 'bg-[#045E80] font-semibold text-white shadow-sm'
                                  : isPastDate
                                    ? 'cursor-not-allowed text-slate-300'
                                    : today && !selectedSchedulerDate
                                  ? 'bg-[#045E80] font-semibold text-white shadow-sm'
                                  : today
                                    ? 'font-semibold text-[#045E80] ring-1 ring-inset ring-[#045E80]/40 hover:bg-[#EAF4F8]'
                                  : inMonth
                                    ? 'text-slate-700 hover:bg-[#EAF4F8] hover:text-[#034C68]'
                                    : 'text-slate-300 hover:bg-slate-50',
                            )}
                          >
                            {format(day, 'd')}
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        disabled={!scheduleStartDate}
                        onClick={() => { setScheduleStartDate(''); setScheduleCalendarOpen(false) }}
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date()
                          setScheduleStartDate(format(today, 'yyyy-MM-dd'))
                          setScheduleCalendarMonth(startOfMonth(today))
                          setScheduleCalendarOpen(false)
                        }}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-[#045E80] transition hover:bg-[#EAF4F8]"
                      >
                        Today
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {p.modalLayout && <TaskSectionHeader section="deadline" required={deadlineRequired} />}
      <div>
        {!p.modalLayout && (
          <label className="form-field-label">
            Deadline {deadlineRequired && <span className="text-red-500">*</span>}
          </label>
        )}
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
          <input id="task-deadline-date" type="date"
                 aria-label={`Deadline${deadlineRequired ? ' (required)' : ''}`}
                 aria-required={deadlineRequired} aria-invalid={!!deadlineError}
                 aria-describedby={deadlineError ? 'task-deadline-error' : undefined}
                 className={cn('form-field task-deadline-date h-8 py-1', deadlineError && 'border-red-400 focus:border-red-500',
                   p.modalLayout && 'h-7 rounded-full px-3 py-1 text-xs leading-4')}
                 value={form.due_date} disabled={!canEditAssignment}
                 onChange={e => {
                   setDeadlineError('')
                   setForm(f => ({ ...f, due_date: e.target.value, deadline_type: '' }))
                 }} />
        </div>
        {deadlineError && (
          <p id="task-deadline-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{deadlineError}</span>
          </p>
        )}
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
