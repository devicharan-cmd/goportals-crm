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
        <div className={row}>
          <span className={label}>Urgent</span>
          <button
            type="button"
            role="switch"
            aria-checked={task.is_urgent}
            onClick={() => update('is_urgent', !task.is_urgent)}
            disabled={saving === 'is_urgent'}
            title={task.is_urgent ? 'In the urgent pool — click to remove' : 'Put this task in the urgent pool'}
            className="flex items-center gap-2 text-sm disabled:opacity-60"
          >
            <span className={cn('relative h-5 w-9 flex-shrink-0 rounded-full transition', task.is_urgent ? 'bg-red-600' : 'bg-slate-300')}>
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', task.is_urgent ? 'left-[18px]' : 'left-0.5')} />
            </span>
            <span className={cn('inline-flex items-center gap-1', task.is_urgent ? 'font-semibold text-red-700' : 'text-slate-500')}>
              {task.is_urgent && <Flame className="h-3.5 w-3.5" />}{task.is_urgent ? 'Yes' : 'No'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
