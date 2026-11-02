'use client'

import { createPortal } from 'react-dom'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Layers3, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { PRIORITY_OPTIONS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { TaskPriority, Ticket } from '@/types/database'

type Row = { title: string; assignee_id: string; due_date: string; priority: TaskPriority }
type DropdownPosition = { left: number; top: number; width: number; maxHeight: number }

function AssigneeSelect({ id, value, options, onChange, onOpenChange }: {
  id: string
  value: string
  options: AssigneeOption[]
  onChange: (value: string) => void
  onOpenChange: (open: boolean) => void
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
      const width = Math.min(Math.max(buttonRect.width, 260), Math.max(0, dialogRect.width - 24))
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
              className="input flex h-10 w-full items-center justify-between gap-2 text-left text-sm"
              aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`}
              onClick={() => {
                const nextOpen = !open
                setOpen(nextOpen)
                onOpenChange(nextOpen)
              }}>
        <span className="flex min-w-0 items-center gap-2">
          {selected && <Avatar name={selected.name} src={selected.avatarUrl} role={selected.avatarRole} size="xs" />}
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
                  <Avatar name={option.name} src={option.avatarUrl} role={option.avatarRole} size="sm" />
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
  return { title: ticket.subject, assignee_id: '', due_date: '', priority: ticket.priority ?? 'P3' }
}

/** "Create tasks from this ticket" — one or more tasks in a single submission, each linked via ticket_id. */
export function CreateTasksModal({
  ticket, assignees, clientAssignee,
}: { ticket: Ticket; assignees: AssigneeOption[]; clientAssignee?: AssigneeOption }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([emptyRow(ticket)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const assigneeOptions = clientAssignee ? [...assignees, clientAssignee] : assignees

  function show() {
    setRows([emptyRow(ticket)])
    setError('')
    setAssigneeDropdownOpen(false)
    setOpen(true)
  }

  function closeModal() {
    setAssigneeDropdownOpen(false)
    setOpen(false)
  }

  function update(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function submit() {
    if (rows.some(r => !r.title.trim())) {
      setError('Every task needs a title.')
      return
    }
    setSaving(true)
    setError('')
    const { data, error } = await createClient().from('tasks').insert(
      rows.map((r, i) => ({
        client_id: ticket.client_id,
        ticket_id: ticket.id,
        title: r.title.trim(),
        description: i === 0 ? ticket.description : null,
        priority: r.priority,
        department_id: ticket.department_id,
        platform_id: null,
        assignee_id: r.assignee_id || null,
        due_date: r.due_date || null,
      })),
    ).select('id')
    setSaving(false)
    if (error) return setError(errorMessage(error))
    setOpen(false)
    if (data && data.length === 1) router.push(`/tasks/${data[0].id}`)
    else router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="secondary" className="w-full" onClick={show}>
        <Plus className="h-3.5 w-3.5" /> Create tasks from this
      </Button>

      <Modal open={open} onClose={closeModal} title="Create tasks from this ticket"
             description="Each row becomes a task linked to this ticket. Assign tasks to one or more people; the ticket automatically becomes Assigned once every active task has an assignee."
             size="xl"
             dialogClassName="flex min-h-[min(560px,88vh)] max-h-[92vh] flex-col overflow-hidden rounded-2xl sm:max-w-4xl"
             headerClassName="border-slate-100 bg-white px-6 py-5 sm:px-7"
             bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-0"
             titleClassName="text-xl font-bold text-slate-900 sm:text-2xl"
             closeButtonClassName="bg-slate-100 text-slate-600 shadow-sm ring-1 ring-inset ring-slate-200 transition-all hover:rotate-90 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 focus-visible:ring-red-300"
             headerIcon={<span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700"><Layers3 className="h-6 w-6" /></span>}>
        <div data-modal-content className="flex-1 space-y-3 px-6 py-5 sm:px-7">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Task {i + 1}</p>
                <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                        disabled={rows.length === 1} aria-label={`Remove task ${i + 1}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.35fr)_minmax(130px,1fr)_minmax(90px,0.7fr)]">
                <div className="min-w-0">
                  <label htmlFor={`task-title-${i}`} className="label text-xs">Task title</label>
                  <input id={`task-title-${i}`} className="input h-9 text-sm" placeholder="Enter task title" value={r.title}
                         onChange={e => update(i, { title: e.target.value })} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`task-assignee-${i}`} className="label text-xs">Assignee</label>
                  <AssigneeSelect id={`task-assignee-${i}`} value={r.assignee_id} options={assigneeOptions} onChange={value => update(i, { assignee_id: value })} onOpenChange={setAssigneeDropdownOpen} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`task-due-date-${i}`} className="label text-xs">Due date</label>
                  <input id={`task-due-date-${i}`} className="input h-9 text-sm" type="date" value={r.due_date}
                         onChange={e => update(i, { due_date: e.target.value })} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`task-priority-${i}`} className="label text-xs">Priority</label>
                  <select id={`task-priority-${i}`} className="input h-9 text-sm" value={r.priority}
                          onChange={e => update(i, { priority: e.target.value as TaskPriority })}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, emptyRow(ticket)])}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-200 bg-transparent px-3 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50">
            <Plus className="h-4 w-4" /> Add another task
          </button>
          {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div data-modal-footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:px-7">
          <p className="hidden text-xs text-slate-500 sm:block">The ticket becomes Assigned when every active task has an assignee.</p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="lg" className="rounded-xl" onClick={closeModal}>Cancel</Button>
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
