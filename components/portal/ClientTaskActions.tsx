'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUS_LABELS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { TaskStatus } from '@/types/database'

export function ClientTaskActions({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function updateStatus(nextStatus: TaskStatus) {
    setSaving(true)
    setError('')
    const { data, error: updateError } = await createClient().from('tasks')
      .update({ status: nextStatus })
      .eq('id', taskId)
      .select('id')
      .maybeSingle()
    setSaving(false)
    if (updateError) return setError(errorMessage(updateError))
    if (!data) return setError('This task could not be updated. Refresh the page and try again.')
    router.refresh()
  }

  if (status === 'completed' || status === 'cancelled') {
    return <p className="text-sm text-slate-500">This task is {TASK_STATUS_LABELS[status].toLowerCase()}.</p>
  }

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {status !== 'ready_for_review' && (
          <Button variant="secondary" size="sm" loading={saving} disabled={saving}
                  onClick={() => updateStatus('in_progress')}>
            {status === 'in_progress' ? 'Continue working' : 'Start task'}
          </Button>
        )}
        {status !== 'ready_for_review' ? (
          <Button size="sm" loading={saving} disabled={saving} onClick={() => updateStatus('ready_for_review')}>
            Submit for review
          </Button>
        ) : (
          <Button variant="secondary" size="sm" loading={saving} disabled={saving}
                  onClick={() => updateStatus('in_progress')}>
            Continue working
          </Button>
        )}
      </div>
      {status === 'ready_for_review' && <p className="text-xs text-slate-500">The GoPortals team will review your submission.</p>}
    </div>
  )
}
