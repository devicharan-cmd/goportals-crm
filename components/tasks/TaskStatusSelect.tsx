'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUS_OPTIONS, taskStatusTransitionWarning } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { TaskStatus, TaskVisibility } from '@/types/database'
import { useRouter } from 'next/navigation'
import { TaskPropertySelect } from '@/components/tasks/TaskPropertySelect'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

export function TaskStatusSelect({
  taskId, status, visibility, ticketId, onWarning,
}: {
  taskId: string
  status: TaskStatus
  visibility: TaskVisibility
  ticketId: string | null
  onWarning: (message: string) => void
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [value, setValue] = useState(status)
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(status), [status])

  async function updateStatus(nextStatus: TaskStatus) {
    const transitionWarning = taskStatusTransitionWarning(value, nextStatus, { visibility, ticketId })
    if (transitionWarning) {
      onWarning(transitionWarning)
      return
    }
    if (nextStatus === 'changes_requested') {
      onWarning('Only the client can request changes from the client portal.')
      return
    }
    const previousStatus = value
    setValue(nextStatus)
    setSaving(true)
    onWarning('')
    const { data, error: updateError } = await createClient()
      .from('tasks')
      .update({ status: nextStatus })
      .eq('id', taskId)
      .select('id')
      .maybeSingle()
    setSaving(false)

    if (updateError) {
      setValue(previousStatus)
      onWarning(errorMessage(updateError))
      return
    }
    if (!data) {
      setValue(previousStatus)
      onWarning('This task could not be updated. Refresh the page and try again.')
      return
    }

    router.refresh()
  }

  return (
    <div className="min-w-0">
      <TaskPropertySelect
        label="Change task status"
        value={value}
        options={TASK_STATUS_OPTIONS.filter(option =>
          visibility !== 'private' || (option.value !== 'client_review' && option.value !== 'changes_requested'),
        )}
        disabled={saving}
        onChange={nextStatus => void runOnce('status', () => updateStatus(nextStatus as TaskStatus))}
      />
    </div>
  )
}
