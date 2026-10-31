'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { PRIORITY_OPTIONS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { TaskPriority, Ticket } from '@/types/database'

type Row = { title: string; assignee_id: string; due_date: string; priority: TaskPriority }

function AssigneeSelect({ value, options, onChange }: {
  value: string
  options: AssigneeOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.id === value)

  return (
    <div className="relative">
      <button type="button" className="input flex h-9 w-full items-center justify-between gap-2 text-left text-sm"
              aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <span className="flex min-w-0 items-center gap-2">
          {selected && <Avatar name={selected.name} src={selected.avatarUrl} role={selected.avatarRole} size="xs" />}
          <span className="truncate">{selected?.name ?? 'Unassigned'}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div role="listbox" aria-label="Assignee" className="absolute left-0 top-full z-40 mt-1 max-h-56 w-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <button type="button" role="option" aria-selected={!value}
                  onClick={() => { onChange(''); setOpen(false) }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${!value ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-[#f3f5f4]'}`}>
            Unassigned
          </button>
          {options.map(option => {
            const active = option.id === value
            return (
              <button key={option.id} type="button" role="option" aria-selected={active}
                      onClick={() => { onChange(option.id); setOpen(false) }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${active ? 'bg-brand-50 text-brand-700' : 'hover:bg-[#f3f5f4]'}`}>
                <Avatar name={option.name} src={option.avatarUrl} role={option.avatarRole} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{option.name}</span>
                  {option.role && <span className="mt-0.5 block text-xs text-slate-500">({option.role})</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function emptyRow(ticket: Ticket): Row {
  return { title: ticket.subject, assignee_id: ticket.assignee_id ?? '', due_date: '', priority: ticket.priority ?? 'P3' }
}

/** "Create tasks from this ticket" — one or more tasks in a single submission, each linked via ticket_id. */
export function CreateTasksModal({ ticket, assignees }: { ticket: Ticket; assignees: AssigneeOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([emptyRow(ticket)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function show() {
    setRows([emptyRow(ticket)])
    setError('')
    setOpen(true)
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

      <Modal open={open} onClose={() => setOpen(false)} title="Create tasks from this ticket"
             description="Each row becomes its own task, linked back to this ticket." size="lg">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_140px_130px_110px_auto]">
              <input className="input h-9 text-sm" placeholder="Task title" value={r.title}
                     onChange={e => update(i, { title: e.target.value })} />
              <AssigneeSelect value={r.assignee_id} options={assignees} onChange={value => update(i, { assignee_id: value })} />
              <input className="input h-9 text-sm" type="date" value={r.due_date} onChange={e => update(i, { due_date: e.target.value })} />
              <select className="input h-9 text-sm" value={r.priority} onChange={e => update(i, { priority: e.target.value as TaskPriority })}>
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
              </select>
              <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                      disabled={rows.length === 1} className="flex items-center justify-center text-slate-400 hover:text-red-600 disabled:opacity-30">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setRows([...rows, emptyRow(ticket)])}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
          <Plus className="h-3.5 w-3.5" /> Add another task
        </button>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={submit}>Create {rows.length > 1 ? `${rows.length} tasks` : 'task'}</Button>
        </div>
      </Modal>
    </>
  )
}
