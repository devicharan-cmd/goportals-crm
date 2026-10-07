'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { PRIORITY_OPTIONS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { TaskPriority, Ticket } from '@/types/database'

type Row = { title: string; assignee_id: string; due_date: string; priority: TaskPriority }

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
              <select className="input h-9 text-sm" value={r.assignee_id} onChange={e => update(i, { assignee_id: e.target.value })}>
                <option value="">Unassigned</option>
                {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
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
