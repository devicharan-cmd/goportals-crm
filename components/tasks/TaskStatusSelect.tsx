'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUS_OPTIONS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { TaskStatus } from '@/types/database'
import { useRouter } from 'next/navigation'
import { TaskPropertySelect } from '@/components/tasks/TaskPropertySelect'

const EMPLOYEE_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_system_process', 'ready_for_review']

export function TaskStatusSelect({
  taskId, status, canCompleteReview,
}: {
  taskId: string
  status: TaskStatus
  canCompleteReview: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(status)
  const [saving, setSaving] = useState(false)
  const [warning, setWarning] = useState('')

  useEffect(() => setValue(status), [status])

  async function updateStatus(nextStatus: TaskStatus) {
    if (status === 'client_review') {
      setWarning('Only the client can approve this task or request changes while it is in Client review.')
      return
    }
    if (status === 'completed') {
      setWarning('Completed tasks cannot be moved to another status.')
      return
    }
    if (nextStatus === 'changes_requested') {
      setWarning('Only the client can request changes from the client portal.')
      return
    }
    if (nextStatus === 'completed') {
      setWarning('Move the task to Client review. The client must approve it before it can be completed.')
      return
    }
    if (nextStatus === 'client_review' && !canCompleteReview) {
      setWarning('Only a team lead or super admin can move a task to Client review.')
      return
    }
    if (!canCompleteReview && !EMPLOYEE_STATUSES.includes(nextStatus)) {
      setWarning('You do not have permission to move the task to this status.')
      return
    }

    const previousStatus = value
    setValue(nextStatus)
    setSaving(true)
    setWarning('')
    const { data, error: updateError } = await createClient()
      .from('tasks')
      .update({ status: nextStatus })
      .eq('id', taskId)
      .select('id')
      .maybeSingle()
    setSaving(false)

    if (updateError) {
      setValue(previousStatus)
      setWarning(errorMessage(updateError))
      return
    }
    if (!data) {
      setValue(previousStatus)
      setWarning('This task could not be updated. Refresh the page and try again.')
      return
    }

    router.refresh()
  }

  return (
    <div className="min-w-0">
      <TaskPropertySelect
        label="Change task status"
        value={value}
        options={TASK_STATUS_OPTIONS}
        disabled={saving}
        onChange={nextStatus => void updateStatus(nextStatus as TaskStatus)}
      />
      {warning && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-2 text-xs text-amber-800">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">{warning}</span>
          <button
            type="button"
            aria-label="Dismiss warning"
            onClick={() => setWarning('')}
            className="flex-shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
    </div>
  )
}
