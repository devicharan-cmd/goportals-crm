'use client'

import { createPortal } from 'react-dom'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Flame, Info, Layers3, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { MarketplacePlatformSelect } from '@/components/shared/Marketplace'
import { TaskBasicInformation } from '@/components/tasks/TaskBasicInformation'
import { TaskFieldsGrid, TaskFormCard, TaskFormCardTitle, TaskSectionHeader } from '@/components/tasks/TaskFormSections'
import { DEADLINE_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS } from '@/lib/constants'
import { cn, dueDateFor, errorMessage, ticketCode } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { DeadlineType, Department, Platform, Service, TaskPriority, TaskType, Ticket } from '@/types/database'

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
  estimated_hours: string
  is_urgent: boolean
  files: File[]
}
type DropdownPosition = { left: number; top: number; width: number; maxHeight: number }
type RowField = 'title' | 'description' | 'assignee_id' | 'due_date' | 'priority'
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
              className={`input flex h-9 w-full items-center justify-between gap-2 rounded-xl text-left text-sm disabled:cursor-not-allowed disabled:bg-slate-50 ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
              aria-required="true" aria-invalid={invalid}
              aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`}
              onClick={() => {
                const nextOpen = !open
                setOpen(nextOpen)
                onOpenChange(nextOpen)
              }}>
        <span className="flex min-w-0 items-center gap-2">
          {selected && <Avatar name={selected.name} src={selected.avatarUrl} role={selected.avatarRole} size="sm" />}
          <span className="truncate">{selected?.name ?? 'Unassigned'}</span>
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
                   className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100" />
          </div>
          <div id={`${id}-options`} role="listbox" aria-label="Assignee"
               className="assignee-dropdown-scroll space-y-1 overflow-y-auto"
                style={{ maxHeight: Math.max(0, position.maxHeight - 60) }}>
            <button type="button" role="option" aria-selected={!value}
                    onClick={() => choose('')}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${!value ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}>
              {value ? <span className="h-4 w-4" /> : <Check className="h-4 w-4 text-brand-600" />}
              Unassigned
            </button>
            {filteredOptions.map(option => {
              const active = option.id === value
              return (
                <button key={option.id} type="button" role="option" aria-selected={active}
                        onClick={() => choose(option.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <Avatar name={option.name} src={option.avatarUrl} role={option.avatarRole} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{option.name}</span>
                    {option.role && <span className="mt-0.5 block truncate text-xs text-slate-500">{option.role}</span>}
                  </span>
                  {active && <Check className="h-4 w-4 flex-shrink-0 text-brand-600" />}
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
    estimated_hours: '',
    is_urgent: false,
    files: [],
  }
}

/** "Create tasks from this ticket" — one or more tasks in a single submission, each linked via ticket_id. */
export function CreateTasksModal({
  ticket, assignees, clientAssignee, meId, canMarkUrgent, departments, platforms, services, hasLinkedTasks,
}: {
  ticket: Ticket
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
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([emptyRow(ticket)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [createdTaskIds, setCreatedTaskIds] = useState<string[] | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, boolean>>({})
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const assigneeOptions: AssigneeChoice[] = [
    ...(clientAssignee ? [clientAssignee] : []),
    ...assignees,
  ]

  function show() {
    setRows([emptyRow(ticket)])
    setError('')
    setFieldErrors({})
    setCreatedTaskIds(null)
    setUploadedFiles({})
    setAssigneeDropdownOpen(false)
    setOpen(true)
  }

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
      <label htmlFor={`task-${field}-${index}`} className="label text-sm">
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
        if (!row.due_date) errors[`${index}.due_date`] = 'Select a due date.'
        if (!row.priority) errors[`${index}.priority`] = 'Select a priority.'
      })
      setFieldErrors(errors)
      if (Object.keys(errors).length > 0) return
    }

    setSaving(true)
    const supabase = createClient()
    let taskIds = createdTaskIds
    if (!taskIds) {
      const newTaskIds = rows.map(() => crypto.randomUUID())
      const { error: insertError } = await supabase.from('tasks').insert(
        rows.map((r, i) => ({
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
        })),
      )
      if (insertError) {
        setSaving(false)
        setError(errorMessage(insertError))
        return
      }
      taskIds = newTaskIds
      setCreatedTaskIds(newTaskIds)
    }

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

        const { error: attachmentError } = await supabase.from('task_attachments').insert({
          task_id: taskIds[index],
          uploaded_by: meId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
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
    if (taskIds.length === 1) router.push(`/tasks/${taskIds[0]}`)
    else router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="primary" className="w-full" onClick={show} disabled={!hasLinkedTasks}>
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
             headerIcon={<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Layers3 className="h-5 w-5" /></span>}>
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
                  <span className="label text-sm">Type</span>
                  <select className="input h-9 rounded-xl text-sm" value={r.type} disabled={!!createdTaskIds}
                          onChange={e => update(i, { type: e.target.value as TaskType })}>
                    {TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="label text-sm">Service</span>
                  <select className="input h-9 rounded-xl text-sm" value={r.service_id} disabled={!!createdTaskIds}
                          onChange={e => {
                            const serviceId = e.target.value
                            const service = services.find(item => item.id === serviceId)
                            update(i, { service_id: serviceId, ...(service?.department_id ? { department_id: service.department_id } : {}) })
                          }}>
                    <option value="">—</option>
                    {services.filter(service => service.is_active || service.id === r.service_id).map(service => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="label text-sm">Department</span>
                  <select className="input h-9 rounded-xl text-sm" value={r.department_id} disabled={!!createdTaskIds}
                          onChange={e => update(i, { department_id: e.target.value })}>
                    <option value="">—</option>
                    {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="label text-sm">Platform</span>
                  <MarketplacePlatformSelect
                    className="input flex h-9 w-full items-center justify-between gap-2 rounded-xl text-sm"
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
                  <AssigneeSelect id={`task-assignee_id-${i}`} value={r.assignee_id} options={assigneeOptions}
                                  onChange={value => update(i, { assignee_id: value })}
                                  onOpenChange={setAssigneeDropdownOpen}
                                  invalid={!!fieldError(i, 'assignee_id')} disabled={!!createdTaskIds} />
                  {fieldErrorText(i, 'assignee_id')}
                </div>
                <div className="min-w-0">
                  {label(i, 'priority', 'Priority')}
                  <select id={`task-priority-${i}`} aria-invalid={!!fieldError(i, 'priority')} required disabled={!!createdTaskIds}
                          className={`input h-9 rounded-xl text-sm ${fieldError(i, 'priority') ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                          value={r.priority}
                          onChange={e => update(i, { priority: e.target.value as TaskPriority })}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {fieldErrorText(i, 'priority')}
                </div>
                <div className="min-w-0">
                  <label htmlFor={`task-estimated-hours-${i}`} className="label text-sm">Estimated hours</label>
                  <input id={`task-estimated-hours-${i}`} className="input h-9 rounded-xl text-sm" type="number" min="0" step="0.5"
                         value={r.estimated_hours} placeholder="Enter hours" disabled={!!createdTaskIds}
                         onChange={e => update(i, { estimated_hours: e.target.value })} />
                </div>
              </TaskFieldsGrid>
              <TaskSectionHeader section="deadline" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {DEADLINE_OPTIONS.map(deadline => (
                    <button key={deadline.value} type="button" disabled={!!createdTaskIds}
                            onClick={() => update(i, r.deadline_type === deadline.value
                              ? { deadline_type: '', due_date: '' }
                              : { deadline_type: deadline.value, due_date: dueDateFor(deadline.value) })}
                            className={cn('inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ring-1 ring-inset transition disabled:opacity-50',
                              r.deadline_type === deadline.value
                                ? 'bg-brand-600 text-white ring-brand-600'
                                : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
                      {deadline.label}
                    </button>
                  ))}
                  <input id={`task-due_date-${i}`} type="date"
                         aria-invalid={!!fieldError(i, 'due_date')} required disabled={!!createdTaskIds}
                         className={`input h-7 w-auto rounded-full px-3 py-1 text-xs leading-4 ${fieldError(i, 'due_date') ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                         value={r.due_date}
                         onChange={e => update(i, { due_date: e.target.value, deadline_type: '' })} />
                </div>
                {fieldErrorText(i, 'due_date')}
              </div>
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
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-200 bg-transparent px-3 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50">
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
            <Button loading={saving} size="lg" className="rounded-xl bg-brand-600 shadow-md hover:bg-brand-700" onClick={submit}>
              {!saving && <Check className="h-4 w-4" />}
              Create {rows.length > 1 ? `${rows.length} tasks` : 'task'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
