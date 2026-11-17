'use client'

import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Flame, Globe2, Info, Layers3, LockKeyhole, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { MarketplacePlatformSelect } from '@/components/shared/Marketplace'
import { TaskBasicInformation } from '@/components/tasks/TaskBasicInformation'
import { AssigneeOptionContent } from '@/components/tasks/AssigneeOptionContent'
import { TaskFieldsGrid, TaskFormCard, TaskFormCardTitle, TaskSectionHeader } from '@/components/tasks/TaskFormSections'
import { DEADLINE_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS } from '@/lib/constants'
import { cn, dueDateFor, errorMessage, ticketCode } from '@/lib/utils'
import { showErrorToast } from '@/lib/ui-toast'
import type { AssigneeOption } from '@/lib/queries'
import type { DeadlineType, Department, Platform, Service, TaskPriority, TaskType, TaskVisibility, Ticket } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

type Row = {
  title: string
  description: string
  type: TaskType
  service_id: string
  department_id: string
  platform_id: string
  assignee_id: string
  due_date: string
  deadline_type: DeadlineType | ''
  priority: TaskPriority
  visibility: TaskVisibility | ''
  estimated_hours: string
  is_urgent: boolean
  files: File[]
  schedule_enabled: boolean
  schedule_repeat: '' | 'daily' | 'weekly' | 'custom'
  schedule_custom_days: string
  schedule_time: string
  schedule_start_date: string
}
type DropdownPosition = { left: number; top: number; width: number; maxHeight: number }
type RowField = 'title' | 'description' | 'assignee_id' | 'due_date' | 'priority' | 'visibility'
type AssigneeChoice = AssigneeOption

function AssigneeSelect({ id, value, options, onChange, onOpenChange, invalid, disabled }: {
  id: string
  value: string
  options: AssigneeChoice[]
  onChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  invalid: boolean
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<DropdownPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selected = options.find(option => option.id === value)
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return options
    return options.filter(option => `${option.name} ${option.role ?? ''} ${option.subtitle ?? ''}`.toLowerCase().includes(query))
  }, [options, search])

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
      const left = Math.min(
        Math.max(buttonRect.left, dialogRect.left + 12),
        dialogRect.right - width - 12,
      )
      const availableBelow = Math.max(0, boundsBottom - buttonRect.bottom - 8)
      const availableAbove = Math.max(0, buttonRect.top - boundsTop - 8)
      const openBelow = availableBelow >= availableAbove
      const available = openBelow ? availableBelow : availableAbove
      const maxHeight = Math.min(320, available)
      setPosition({
        left,
        top: openBelow ? buttonRect.bottom + 8 : buttonRect.top - maxHeight - 8,
        width,
        maxHeight,
      })
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
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
      onOpenChange(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, onOpenChange])

  function choose(assigneeId: string) {
    onChange(assigneeId)
    setOpen(false)
    onOpenChange(false)
  }

  return (
    <div>
      <button ref={buttonRef} id={id} type="button"
              disabled={disabled}
              className={`form-field flex h-9 w-full items-center justify-between gap-2 rounded-xl text-left text-sm disabled:cursor-not-allowed disabled:bg-slate-50 ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
              aria-required="true" aria-invalid={invalid}
              aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`}
              onClick={() => {
                const nextOpen = !open
                setOpen(nextOpen)
                onOpenChange(nextOpen)
              }}>
        <span className="flex min-w-0 items-center gap-2">
          {selected && <Avatar name={selected.name} src={selected.avatarUrl} role={selected.avatarRole} size="sm" />}
          <span className="truncate">{selected?.name ?? 'Select assignee…'}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && position && typeof document !== 'undefined' && createPortal(
        <div ref={dropdownRef} role="presentation"
             className="fixed z-[1200] overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5"
             style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
          <div className="relative mb-2">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)}
                   placeholder="Search assignees…" aria-label="Search assignees"
                   className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#0A6F94] focus:bg-white focus:ring-2 focus:ring-[#CFE6EF]" />
          </div>
          <div id={`${id}-options`} role="listbox" aria-label="Assignee"
               className="assignee-options-scroll-area space-y-1 overflow-y-auto"
                style={{ maxHeight: Math.max(0, position.maxHeight - 60) }}>
            {filteredOptions.map(option => {
              const active = option.id === value
              return (
                <button key={option.id} type="button" role="option" aria-selected={active}
                        onClick={() => choose(option.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${active ? 'bg-[#EAF4F8]' : 'hover:bg-slate-50'}`}>
                  <AssigneeOptionContent
                    name={option.name}
                    avatarUrl={option.avatarUrl}
                    avatarRole={option.avatarRole}
                    roleLabel={option.role}
                  />
                  {active && <Check className="h-4 w-4 flex-shrink-0 text-[#045E80]" />}
                </button>
              )
            })}
            {filteredOptions.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-500">No assignees found.</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function emptyRow(ticket: Ticket): Row {
  return {
    title: ticket.subject,
    description: '',
    type: 'task',
    service_id: '',
    department_id: ticket.department_id ?? '',
    platform_id: '',
    assignee_id: '',
    due_date: '',
    deadline_type: '',
    priority: ticket.priority ?? 'P3',
    visibility: '',
    estimated_hours: '',
    is_urgent: false,
    files: [],
    schedule_enabled: false,
    schedule_repeat: '',
    schedule_custom_days: '',
    schedule_time: '',
    schedule_start_date: '',
  }
}

/** "Create tasks from this ticket" — one or more tasks in a single submission, each linked via ticket_id. */
export function CreateTasksModal({
  ticket, assignees, clientAssignee, meId, canMarkUrgent, departments, platforms, services, hasLinkedTasks,
}: {
  ticket: Ticket & { client?: { company_name?: string; contact_name?: string | null } | null }
  assignees: AssigneeOption[]
  clientAssignee?: AssigneeOption
  meId: string
  canMarkUrgent: boolean
  departments: Department[]
  platforms: Platform[]
  services: Service[]
  hasLinkedTasks: boolean
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([emptyRow(ticket)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [createdTaskIds, setCreatedTaskIds] = useState<string[] | null>(null)
  const [scheduleIds, setScheduleIds] = useState<(string | null)[] | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, boolean>>({})
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const assigneeOptions: AssigneeChoice[] = [
    ...(clientAssignee ? [clientAssignee] : []),
    ...assignees,
  ]

  const clientName = (ticket as any).client?.company_name || 'the client'

  function show() {
    setRows([emptyRow(ticket)])
    setError('')
    setFieldErrors({})
    setCreatedTaskIds(null)
    setScheduleIds(null)
    setUploadedFiles({})
    setAssigneeDropdownOpen(false)
    setOpen(true)
  }

  async function handleOpenModal() {
    if (saving) return
    const supabase = createClient()
    const { data: ticketCheck } = await supabase
      .from('tickets')
      .select('id')
      .eq('id', ticket.id)
      .maybeSingle()

    if (!ticketCheck) {
      showErrorToast(`This ticket was deleted by ${clientName} and doesn't exist anymore.`)
      router.push('/tickets')
      router.refresh()
      return
    }

    show()
  }

  // Real-time listener: if client deletes ticket while modal is open, immediately close, notify, and redirect
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    const channel = supabase
      .channel(`modal-ticket-watch-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${ticket.id}`,
        },
        () => {
          setOpen(false)
          showErrorToast(`This ticket was deleted by ${clientName} and doesn't exist anymore.`)
          router.push('/tickets')
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [open, ticket.id, clientName, router])

  function closeModal() {
    if (saving) return
    if (createdTaskIds && rows.some((row, rowIndex) =>
      row.files.some((_, fileIndex) => !uploadedFiles[`${rowIndex}.${fileIndex}`])
    )) {
      setError('Tasks were created, but some files still need to upload. Retry before closing.')
      return
    }
    setAssigneeDropdownOpen(false)
    setOpen(false)
  }

  function update(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    setFieldErrors(current => {
      const next = { ...current }
      for (const field of Object.keys(patch)) delete next[`${i}.${field}`]
      return next
    })
  }

  function fieldError(index: number, field: RowField) {
    return fieldErrors[`${index}.${field}`]
  }

  function label(index: number, field: RowField, text: string) {
    return (
      <label htmlFor={`task-${field}-${index}`} className="form-field-label text-sm">
        {text} <span className="text-red-600" aria-hidden="true">*</span>
      </label>
    )
  }

  function fieldErrorText(index: number, field: RowField) {
    const message = fieldError(index, field)
    return message ? <p className="mt-1 text-xs font-medium text-red-600">{message}</p> : null
  }

  async function submit() {
    setError('')
    if (!createdTaskIds) {
      const errors: Record<string, string> = {}
      rows.forEach((row, index) => {
        if (!row.title.trim()) errors[`${index}.title`] = 'Enter a task title.'
        if (!row.description.trim()) errors[`${index}.description`] = 'Add a description.'
        if (!row.assignee_id) errors[`${index}.assignee_id`] = 'Select an assignee.'
        if (!row.schedule_enabled && !row.due_date) errors[`${index}.due_date`] = 'Select a due date.'
        if (row.schedule_enabled && (!row.schedule_repeat || !row.schedule_time || !row.schedule_start_date
          || (row.schedule_repeat === 'custom' && (!row.schedule_custom_days || Number(row.schedule_custom_days) < 2)))) {
          errors[`${index}.schedule`] = 'Choose a repeat schedule, time, and start date.'
        }
        if (!row.priority) errors[`${index}.priority`] = 'Select a priority.'
        if (!row.visibility) errors[`${index}.visibility`] = 'Select task visibility (Public or Private).'
      })
      setFieldErrors(errors)
      if (Object.keys(errors).length > 0) return
    }

    setSaving(true)
    const supabase = createClient()

    // Ensure ticket was not deleted by client before creating tasks
    const { data: ticketCheck } = await supabase
      .from('tickets')
      .select('id')
      .eq('id', ticket.id)
      .maybeSingle()

    if (!ticketCheck) {
      setSaving(false)
      setOpen(false)
      showErrorToast(`This ticket was deleted by ${clientName} and doesn't exist anymore.`)
      router.push('/tickets')
      router.refresh()
      return
    }

    let taskIds = createdTaskIds
    if (!taskIds) {
      const newTaskIds = rows.map(() => crypto.randomUUID())
      const immediateRows = rows.flatMap((r, i) => r.schedule_enabled ? [] : [{
          id: newTaskIds[i],
          client_id: ticket.client_id,
          ticket_id: ticket.id,
          title: r.title.trim(),
          description: r.description.trim(),
          priority: r.priority,
          type: r.type,
          service_id: r.service_id || null,
          department_id: r.department_id || null,
          platform_id: r.platform_id || null,
          assignee_id: r.assignee_id,
          due_date: r.due_date,
          deadline_type: r.deadline_type || null,
          estimated_hours: r.estimated_hours ? Number(r.estimated_hours) : null,
          is_urgent: r.is_urgent,
          visibility: r.visibility as TaskVisibility,
        }])
      if (immediateRows.length) {
        const { error: insertError } = await supabase.from('tasks').insert(immediateRows)
        if (insertError) {
          const { data: exists } = await supabase.from('tickets').select('id').eq('id', ticket.id).maybeSingle()
          if (!exists) {
            setSaving(false)
            setOpen(false)
            showErrorToast(`This ticket was deleted by ${clientName} and doesn't exist anymore.`)
            router.push('/tickets')
            router.refresh()
            return
          }
          setSaving(false)
          setError(errorMessage(insertError))
          return
        }
      }
      taskIds = newTaskIds
      setCreatedTaskIds(newTaskIds)
    }

    const activeScheduleIds: (string | null)[] = [...(scheduleIds ?? rows.map(() => null))]
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      if (!row.schedule_enabled || activeScheduleIds[index]) continue
      const { data: scheduleId, error: scheduleError } = await supabase.rpc('create_task_schedule', {
          p_task_id: taskIds[index],
          p_task_payload: {
            title: row.title.trim(), description: row.description.trim() || null,
            client_id: ticket.client_id, ticket_id: ticket.id, visibility: row.visibility as TaskVisibility,
            type: row.type, priority: row.priority, is_urgent: row.is_urgent,
            service_id: row.service_id || null, department_id: row.department_id || null,
            platform_id: row.platform_id || null, assignee_id: row.assignee_id,
            estimated_hours: row.estimated_hours ? Number(row.estimated_hours) : null,
            due_date: null, deadline_type: null,
          },
          p_repeat_type: row.schedule_repeat,
          p_interval_days: row.schedule_repeat === 'custom' ? Number(row.schedule_custom_days) : null,
          p_start_date: row.schedule_start_date,
          p_schedule_time: row.schedule_time,
      })
      if (scheduleError || !scheduleId) {
        setScheduleIds(activeScheduleIds)
        setSaving(false)
        setError(`Could not schedule Task ${index + 1}: ${errorMessage(scheduleError ?? new Error('Schedule was not saved.'))}`)
        return
      }
      activeScheduleIds[index] = scheduleId as string
    }
    setScheduleIds(activeScheduleIds)

    let uploadError = ''
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      for (let fileIndex = 0; fileIndex < row.files.length; fileIndex += 1) {
        const uploadKey = `${index}.${fileIndex}`
        const file = row.files[fileIndex]
        if (uploadedFiles[uploadKey]) continue

        const safeName = file.name.replace(/[\\/]/g, '_')
        const path = `${taskIds[index]}/${crypto.randomUUID()}-${safeName}`
        const { error: storageError } = await supabase.storage.from('task-files').upload(path, file)
        if (storageError) {
          uploadError = `Could not upload "${file.name}" for Task ${index + 1}: ${errorMessage(storageError)}`
          break
        }

        const { error: attachmentError } = row.schedule_enabled
          ? await supabase.from('task_schedule_attachments').insert({
              schedule_id: activeScheduleIds[index], uploaded_by: meId, storage_path: path,
              file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
            })
          : await supabase.from('task_attachments').insert({
              task_id: taskIds[index], uploaded_by: meId, storage_path: path,
              file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
            })
        if (attachmentError) {
          const { error: cleanupError } = await supabase.storage.from('task-files').remove([path])
          uploadError = cleanupError
            ? `Could not save "${file.name}" for Task ${index + 1}: ${errorMessage(attachmentError)} The uploaded file could not be cleaned up.`
            : `Could not save "${file.name}" for Task ${index + 1}: ${errorMessage(attachmentError)}`
          break
        }
        setUploadedFiles(current => ({ ...current, [uploadKey]: true }))
      }
      if (uploadError) break
    }

    setSaving(false)
    if (uploadError) {
      setError(`Tasks were created, but ${uploadError}`)
      return
    }

    setOpen(false)
    if (rows.some(row => row.schedule_enabled)) router.push(`/tickets/${ticket.id}?scheduled=1`)
    else if (taskIds.length === 1) router.push(`/tasks/${taskIds[0]}`)
    else router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="primary" className="w-full" onClick={handleOpenModal} disabled={!hasLinkedTasks}>
        <Plus className="h-3.5 w-3.5" /> Create tasks for {ticketCode(ticket.ticket_number)}
      </Button>
      {!hasLinkedTasks && <p className="mt-2 text-center text-xs text-slate-500">Create the first task from the New Task form.</p>}

      <Modal open={open} onClose={closeModal} title="Add tasks"
             description="Create and assign tasks for this ticket."
             size="xl"
             dialogClassName="flex min-h-[min(560px,88vh)] max-h-[92vh] flex-col overflow-hidden rounded-2xl sm:max-w-4xl"
             headerClassName="border-slate-100 bg-white px-6 py-3 sm:px-7"
             bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
             titleClassName="text-lg font-bold text-slate-900"
             closeButtonClassName="bg-slate-100 text-slate-600 shadow-sm ring-1 ring-inset ring-slate-200 transition-all hover:rotate-90 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 focus-visible:ring-red-300"
             headerIcon={<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#CFE6EF] text-[#034C68]"><Layers3 className="h-5 w-5" /></span>}>
        <div data-modal-content className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 sm:px-7">
          {rows.map((r, i) => (
            <TaskFormCard key={i} enabled>
              <TaskFormCardTitle title={`Task ${i + 1}`} action={
                <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                        disabled={rows.length === 1 || !!createdTaskIds} aria-label={`Remove task ${i + 1}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                  <Trash2 className="h-4 w-4" />
                </button>
              } />
              <TaskBasicInformation
                idPrefix={`task-${i}`}
                title={r.title}
                description={r.description}
                onTitleChange={title => update(i, { title })}
                onDescriptionChange={description => update(i, { description })}
                files={r.files}
                onFilesChange={files => update(i, { files })}
                onRemoveFile={fileIndex => update(i, { files: r.files.filter((_, n) => n !== fileIndex) })}
                disabled={!!createdTaskIds}
                titleError={fieldError(i, 'title')}
                descriptionError={fieldError(i, 'description')}
                descriptionRequired
              />
              <TaskSectionHeader section="configuration" />
              <TaskFieldsGrid columns="four">
                <label className="min-w-0">
                  <span className="form-field-label text-sm">Type</span>
                  <SearchableSelect className="form-field h-9 rounded-xl text-sm" value={r.type} disabled={!!createdTaskIds}
                          onChange={e => update(i, { type: e.target.value as TaskType })}>
                    {TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SearchableSelect>
                </label>
                <label className="min-w-0">
                  <span className="form-field-label text-sm">Service</span>
                  <SearchableSelect className="form-field h-9 rounded-xl text-sm" value={r.service_id} disabled={!!createdTaskIds}
                          onChange={e => {
                            const serviceId = e.target.value
                            const service = services.find(item => item.id === serviceId)
                            update(i, { service_id: serviceId, ...(service?.department_id ? { department_id: service.department_id } : {}) })
                          }}>
                    <option value="">—</option>
                    {services.filter(service => service.is_active || service.id === r.service_id).map(service => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </SearchableSelect>
                </label>
                <label className="min-w-0">
                  <span className="form-field-label text-sm">Department</span>
                  <SearchableSelect className="form-field h-9 rounded-xl text-sm" value={r.department_id} disabled={!!createdTaskIds}
                          onChange={e => update(i, { department_id: e.target.value })}>
                    <option value="">—</option>
                    {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </SearchableSelect>
                </label>
                <label className="min-w-0">
                  <span className="form-field-label text-sm">Platform</span>
                  <MarketplacePlatformSelect
                    className="form-field flex h-9 w-full items-center justify-between gap-2 rounded-xl text-sm"
                    platforms={platforms.filter(platform => platform.is_active || platform.id === r.platform_id)}
                    value={r.platform_id}
                    placeholder="—"
                    disabled={!!createdTaskIds}
                    onChange={value => update(i, { platform_id: value })}
                  />
                </label>
              </TaskFieldsGrid>
              <TaskFieldsGrid columns="three">
                <div className="min-w-0">
                  {label(i, 'assignee_id', 'Assignee')}
                  <AssigneeSelect id={`task-assignee_id-${i}`} value={r.assignee_id}
                                  options={assigneeOptions}
                                  onChange={value => update(i, {
                                    assignee_id: value,
                                    ...(value === clientAssignee?.id ? { visibility: 'public' } : {}),
                                  })}
                                  onOpenChange={setAssigneeDropdownOpen}
                                  invalid={!!fieldError(i, 'assignee_id')} disabled={!!createdTaskIds} />
                  {fieldErrorText(i, 'assignee_id')}
                </div>
                <div className="min-w-0">
                  {label(i, 'priority', 'Priority')}
                  <SearchableSelect id={`task-priority-${i}`} aria-invalid={!!fieldError(i, 'priority')} required disabled={!!createdTaskIds}
                          className={`form-field h-9 rounded-xl text-sm ${fieldError(i, 'priority') ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                          value={r.priority}
                          onChange={e => update(i, { priority: e.target.value as TaskPriority })}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </SearchableSelect>
                  {fieldErrorText(i, 'priority')}
                </div>
                <div className="min-w-0">
                  <label htmlFor={`task-estimated-hours-${i}`} className="form-field-label text-sm">Estimated hours</label>
                  <input id={`task-estimated-hours-${i}`} className="form-field h-9 rounded-xl text-sm" type="number" min="0" step="0.5"
                         value={r.estimated_hours} placeholder="Enter hours" disabled={!!createdTaskIds}
                         onChange={e => update(i, { estimated_hours: e.target.value })} />
                </div>
              </TaskFieldsGrid>
              <section className="mt-4" aria-labelledby={`task-visibility-${i}`}>
                <TaskSectionHeader section="visibility" required id={`task-visibility-${i}`} />
                <p className="-mt-1 mb-2.5 text-xs leading-4 text-slate-500">
                  {r.assignee_id === clientAssignee?.id
                    ? 'Tasks assigned to the client are always public.'
                    : 'Private tasks are hidden from the client and assigned to staff only; the ticket remains visible.'}
                </p>
                <div className="grid max-w-[26rem] gap-2 sm:grid-cols-2">
                  {([
                    { value: 'public', title: 'Public', description: 'Client + authorized staff' },
                    { value: 'private', title: 'Private', description: 'Authorized staff only' },
                  ] as const).map(option => {
                    const selected = r.visibility === option.value
                    const hasError = !!fieldError(i, 'visibility') && !r.visibility
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={!!createdTaskIds || (option.value === 'private' && r.assignee_id === clientAssignee?.id)}
                        onClick={() => update(i, {
                          visibility: option.value,
                        })}
                        className={cn(
                          'flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                          selected
                            ? 'border-[#045E80] bg-[#EAF4F8] ring-1 ring-inset ring-[#045E80]'
                            : hasError
                              ? 'border-red-400 bg-white hover:bg-red-50/20'
                              : 'border-slate-300 bg-white hover:bg-slate-50',
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
                          selected
                            ? 'border-[#045E80] bg-[#045E80] shadow-[inset_0_0_0_3px_white]'
                            : hasError
                              ? 'border-red-400'
                              : 'border-slate-300')} />
                      </button>
                    )
                  })}
                </div>
                {fieldErrorText(i, 'visibility')}
              </section>
              <TaskSectionHeader section="deadline" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {DEADLINE_OPTIONS.map(deadline => (
                    <button key={deadline.value} type="button" disabled={!!createdTaskIds || r.schedule_enabled}
                            onClick={() => update(i, r.deadline_type === deadline.value
                              ? { deadline_type: '', due_date: '' }
                              : { deadline_type: deadline.value, due_date: dueDateFor(deadline.value) })}
                            className={cn('inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ring-1 ring-inset transition disabled:opacity-50',
                              r.deadline_type === deadline.value
                                ? 'bg-[#045E80] text-white ring-[#045E80]'
                                : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
                      {deadline.label}
                    </button>
                  ))}
                  <input id={`task-due_date-${i}`} type="date"
                         aria-invalid={!!fieldError(i, 'due_date')} required disabled={!!createdTaskIds || r.schedule_enabled}
                         className={`form-field task-deadline-date h-8 min-w-0 flex-none rounded-full bg-white px-3 py-1 text-xs leading-4 ${fieldError(i, 'due_date') ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                         value={r.due_date}
                         onChange={e => update(i, { due_date: e.target.value, deadline_type: '' })} />
                </div>
                {fieldErrorText(i, 'due_date')}
              </div>
              <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <TaskSectionHeader section="scheduler" className="flex items-center gap-2" />
                  <label className={cn(
                    'inline-flex items-center gap-2 text-xs font-medium text-slate-600',
                    createdTaskIds ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                  )}>
                    <input
                      type="checkbox"
                      checked={r.schedule_enabled}
                      disabled={!!createdTaskIds}
                      onChange={event => update(i, { schedule_enabled: event.target.checked })}
                      className="peer sr-only"
                    />
                    <span>Enable Schedule</span>
                    <span aria-hidden="true" className={cn(
                      'relative h-6 w-10 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-[#045E80] peer-focus-visible:ring-offset-2',
                      r.schedule_enabled ? 'bg-[#045E80] after:translate-x-4' : 'bg-slate-300 after:translate-x-0',
                    )} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="min-w-0 text-xs font-medium text-slate-600">
                    Repeat
                    <SearchableSelect
                      className="form-field mt-1 h-9 w-full rounded-xl text-sm"
                      value={r.schedule_repeat}
                      disabled={!r.schedule_enabled || !!createdTaskIds}
                      placeholder="Select schedule"
                      dropdownMinWidth={200}
                      options={[
                        { value: '', text: 'Select schedule', label: 'Select schedule' },
                        { value: 'daily', text: 'Daily', label: 'Daily' },
                        { value: 'weekly', text: 'For a week', label: 'For a week' },
                        { value: 'custom', text: 'Custom', label: 'Custom', selectedLabel: r.schedule_custom_days ? `${r.schedule_custom_days} day` : 'Custom' },
                      ]}
                      keepOpenOnSelect={value => value === 'custom'}
                      onClose={() => {
                        if (r.schedule_repeat === 'custom' && (!r.schedule_custom_days || Number(r.schedule_custom_days) < 2)) {
                          update(i, { schedule_repeat: '', schedule_custom_days: '' })
                        }
                      }}
                      onChange={event => {
                        const repeat = event.target.value as Row['schedule_repeat']
                        update(i, { schedule_repeat: repeat, schedule_custom_days: repeat === 'custom' ? (r.schedule_custom_days || '2') : '' })
                      }}
                      dropdownFooter={r.schedule_repeat === 'custom' ? (
                        <div>
                          <label htmlFor={`task-schedule-days-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Repeat every</label>
                          <div className="flex h-9 overflow-hidden rounded-lg">
                            <input id={`task-schedule-days-${i}`} type="number" min={2} step={1} value={r.schedule_custom_days}
                              disabled={!!createdTaskIds} aria-label="Repeat every number of days"
                              onChange={event => {
                                const days = event.target.value
                                update(i, { schedule_custom_days: !days || Number(days) < 2 ? '' : days })
                              }} className="form-field h-9 min-w-0 flex-1 rounded-r-none" />
                            <span className="flex h-9 items-center border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">day</span>
                          </div>
                        </div>
                      ) : undefined}
                    />
                  </label>
                  <label className="min-w-0 text-xs font-medium text-slate-600">Time
                    <input type="time" value={r.schedule_time} disabled={!r.schedule_enabled || !!createdTaskIds}
                      onChange={event => update(i, { schedule_time: event.target.value })}
                      className="form-field mt-1 h-9 w-full rounded-xl text-sm disabled:bg-slate-50 disabled:text-slate-500" />
                  </label>
                  <label className="min-w-0 text-xs font-medium text-slate-600">Start date
                    <input type="date" value={r.schedule_start_date} min={new Date().toLocaleDateString('en-CA')}
                      disabled={!r.schedule_enabled || !!createdTaskIds}
                      onChange={event => update(i, { schedule_start_date: event.target.value })}
                      className="form-field mt-1 h-9 w-full rounded-xl text-sm disabled:bg-slate-50 disabled:text-slate-500" />
                  </label>
                </div>
                {fieldErrors[`${i}.schedule`] && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{fieldErrors[`${i}.schedule`]}</p>}
              </section>
              {canMarkUrgent && (
                <label className={cn('mt-3 inline-flex w-fit cursor-pointer items-center gap-2 text-sm',
                  r.is_urgent ? 'font-medium text-red-700' : 'text-slate-600',
                  createdTaskIds && 'cursor-not-allowed opacity-50')}>
                  <input type="checkbox" checked={r.is_urgent} disabled={!!createdTaskIds}
                         onChange={e => update(i, { is_urgent: e.target.checked })}
                         className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                  <Flame aria-hidden="true" className="h-4 w-4" />
                  <span>Mark as urgent</span>
                </label>
              )}
            </TaskFormCard>
          ))}
          <button type="button" disabled={!!createdTaskIds} onClick={() => setRows([...rows, emptyRow(ticket)])}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#9FCCDE] bg-transparent px-3 text-sm font-semibold text-[#034C68] transition-colors hover:border-[#2A87AA] hover:bg-[#EAF4F8] disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" /> Add another task
          </button>
          {error && (
            <p role="alert" className="inline-flex w-fit max-w-full items-start rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium leading-5 text-red-700">
              {error}
            </p>
          )}
        </div>
        <div data-modal-footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:px-7">
          <p className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
            Tasks will be linked to this ticket.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="lg" className="rounded-xl" disabled={saving} onClick={closeModal}>Cancel</Button>
            <Button loading={saving} size="lg" className="rounded-xl bg-[#045E80] shadow-md hover:bg-[#034C68]" onClick={() => void runOnce('create-tasks', submit)}>
              {!saving && <Check className="h-4 w-4" />}
              Create {rows.length > 1 ? `${rows.length} tasks` : 'task'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
