'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PRIORITY_OPTIONS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import type { TaskPriority } from '@/types/database'
import { TaskPropertySelect } from '@/components/tasks/TaskPropertySelect'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

function useTaskPropertyUpdate(taskId: string) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function update(priority: TaskPriority | null, isUrgent: boolean | null) {
    setSaving(true)
    setError('')
    const { error: updateError } = await createClient().rpc('update_task_priority_urgency', {
      p_task_id: taskId,
      p_priority: priority,
      p_is_urgent: isUrgent,
    })
    setSaving(false)
    if (updateError) {
      setError(errorMessage(updateError))
      return
    }
    router.refresh()
  }

  return { saving, error, update, runOnce }
}

export function TaskPrioritySelect({ taskId, priority }: {
  taskId: string
  priority: TaskPriority
}) {
  const { saving, error, update, runOnce } = useTaskPropertyUpdate(taskId)

  return (
    <div className="min-w-0">
      <TaskPropertySelect
        label="Task priority"
        value={priority}
        options={PRIORITY_OPTIONS}
        disabled={saving}
        onChange={value => void runOnce('priority', () => update(value as TaskPriority, null))}
      />
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function TaskUrgentToggle({ taskId, isUrgent }: {
  taskId: string
  isUrgent: boolean
}) {
  const { saving, error, update, runOnce } = useTaskPropertyUpdate(taskId)

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-label={isUrgent ? 'Remove urgent flag' : 'Mark task urgent'}
        title={isUrgent ? 'Remove urgent flag' : 'Mark task urgent'}
        role="switch"
        aria-checked={isUrgent}
        disabled={saving}
        onClick={() => void runOnce('urgency', () => update(null, !isUrgent))}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60',
          isUrgent ? 'bg-red-600 focus-visible:ring-red-400' : 'bg-slate-300 focus-visible:ring-slate-400',
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200',
            isUrgent ? 'translate-x-5' : 'translate-x-0',
          )}
        >
          <Flame aria-hidden="true" className={cn('h-3 w-3', isUrgent ? 'text-red-600' : 'text-slate-400')} />
        </span>
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
