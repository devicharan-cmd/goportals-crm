'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUS_OPTIONS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { TaskStatus } from '@/types/database'
import { useRouter } from 'next/navigation'

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
  const [error, setError] = useState('')
  const options = canCompleteReview
    ? TASK_STATUS_OPTIONS
    : TASK_STATUS_OPTIONS.filter(option => EMPLOYEE_STATUSES.includes(option.value))

  useEffect(() => setValue(status), [status])

  async function updateStatus(nextStatus: TaskStatus) {
    const previousStatus = value
    setValue(nextStatus)
    setSaving(true)
    setError('')
    const { data, error: updateError } = await createClient()
      .from('tasks')
      .update({ status: nextStatus })
      .eq('id', taskId)
      .select('id')
      .maybeSingle()
    setSaving(false)

    if (updateError) {
      setValue(previousStatus)
      setError(errorMessage(updateError))
      return
    }
    if (!data) {
      setValue(previousStatus)
      setError('This task could not be updated. Refresh the page and try again.')
      return
    }

    router.refresh()
  }

  return (
    <div className="min-w-0">
      <select
        aria-label="Change task status"
        className="form-field h-9 w-full py-1 text-sm"
        value={value}
        disabled={saving}
        onChange={event => void updateStatus(event.target.value as TaskStatus)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-1 flex items-start gap-1 text-xs text-red-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
