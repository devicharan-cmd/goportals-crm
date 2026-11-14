'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUS_OPTIONS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { TaskStatus, TaskVisibility } from '@/types/database'
import { useRouter } from 'next/navigation'
import { TaskPropertySelect } from '@/components/tasks/TaskPropertySelect'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

const EMPLOYEE_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_system_process', 'ready_for_review']

export function TaskStatusSelect({
  taskId, status, visibility, canCompleteReview, onWarning,
}: {
  taskId: string
  status: TaskStatus
  visibility: TaskVisibility
  canCompleteReview: boolean
  onWarning: (message: string) => void
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [value, setValue] = useState(status)
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(status), [status])

  async function updateStatus(nextStatus: TaskStatus) {
    if (visibility === 'private' && (nextStatus === 'client_review' || nextStatus === 'changes_requested')) {
      onWarning('Private tasks cannot enter Client review or Changes requested.')
      return
    }
    if (nextStatus === 'changes_requested') {
      onWarning('Only the client can request changes from the client portal.')
      return
    }
    if (nextStatus === 'completed') {
      if (!canCompleteReview) {
        onWarning('Only a team lead or super admin can mark a task as completed.')
        return
      }
    } else if (nextStatus === 'client_review' && !canCompleteReview) {
      onWarning('Only a team lead or super admin can move a task to Client review.')
      return
    } else if (!canCompleteReview && !EMPLOYEE_STATUSES.includes(nextStatus)) {
      onWarning('You do not have permission to move the task to this status.')
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
