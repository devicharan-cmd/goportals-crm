'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { AssignButton, type AssigneeOption } from '@/components/tasks/AssignButton'
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import type { Task, TaskPriority, TaskStatus } from '@/types/database'

/** Inline-editable status / priority / assignee / due date / urgent for the task detail sidebar. */
export function TaskProperties({
  task, assignees, assigneeName, canMarkUrgent, canAssign,
}: { task: Task; assignees: AssigneeOption[]; assigneeName: string | null; canMarkUrgent: boolean; canAssign: boolean }) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function update(field: string, value: unknown) {
    setSaving(field)
    setError('')
    const { error } = await createClient().from('tasks').update({ [field]: value }).eq('id', task.id)
    setSaving(null)
    if (error) setError(errorMessage(error))
    router.refresh()
  }

  const row = 'grid grid-cols-[100px_1fr] items-center gap-3'
  const label = 'text-xs font-medium text-slate-500'
  const select = cn('input h-9 py-1.5 text-sm')

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className={row}>
        <span className={label}>Status</span>
        <select className={select} value={task.status} disabled={saving === 'status'}
                onChange={e => update('status', e.target.value as TaskStatus)}>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className={row}>
        <span className={label}>Priority</span>
        <select className={select} value={task.priority} disabled={saving === 'priority'}
                onChange={e => update('priority', e.target.value as TaskPriority)}>
          {PRIORITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className={row}>
        <span className={label}>Assignee</span>
        <div className="flex min-w-0 items-center justify-between gap-2">
          {task.assignee_id
            ? <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800"><Avatar name={assigneeName} size="xs" /><span className="truncate">{assigneeName ?? '—'}</span></span>
            : <span className="text-sm italic text-slate-400">Unassigned</span>}
          {canAssign && <AssignButton taskId={task.id} currentId={task.assignee_id} options={assignees} variant="link" />}
        </div>
      </div>

      <div className={row}>
        <span className={label}>Due date</span>
        <input type="date" className={select} value={task.due_date ?? ''} disabled={saving === 'due_date'}
               onChange={e => update('due_date', e.target.value || null)} />
      </div>

      {canMarkUrgent && (
        <button
          onClick={() => update('is_urgent', !task.is_urgent)}
          disabled={saving === 'is_urgent'}
          className={cn('flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset transition',
            task.is_urgent ? 'bg-red-600 text-white ring-red-600 hover:bg-red-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-red-50 hover:text-red-700')}
        >
          <Flame className="h-4 w-4" /> {task.is_urgent ? 'Urgent — click to clear' : 'Mark as urgent'}
        </button>
      )}
    </div>
  )
}
