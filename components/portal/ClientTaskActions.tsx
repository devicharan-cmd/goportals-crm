'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUS_LABELS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { TaskStatus } from '@/types/database'

export function ClientTaskActions({
  taskId, status, assignedToClient,
}: { taskId: string; status: TaskStatus; assignedToClient: boolean }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [requestingChanges, setRequestingChanges] = useState(false)

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

  async function reviewTask(action: 'approve' | 'request_changes') {
    if (action === 'request_changes' && !feedback.trim()) {
      setError('Please tell us what needs to change.')
      return
    }

    setSaving(true)
    setError('')
    const { error: actionError } = await createClient().rpc(
      action === 'approve' ? 'client_approve_task' : 'client_request_task_changes',
      action === 'approve'
        ? { p_task_id: taskId }
        : { p_task_id: taskId, p_feedback: feedback.trim() },
    )
    setSaving(false)
    if (actionError) return setError(errorMessage(actionError))
    setFeedback('')
    setRequestingChanges(false)
    router.refresh()
  }

  if (status === 'completed' || status === 'cancelled') {
    return <p className="text-sm text-slate-500">This task is {TASK_STATUS_LABELS[status].toLowerCase()}.</p>
  }

  if (status === 'client_review') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Review the completed work and approve it, or send it back with feedback.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={saving} disabled={saving} onClick={() => reviewTask('approve')}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve task
          </Button>
          <Button variant="secondary" size="sm" disabled={saving} onClick={() => { setError(''); setRequestingChanges(true) }}>
            <RotateCcw className="h-3.5 w-3.5" /> Request changes
          </Button>
        </div>
        {requestingChanges && (
          <div className="space-y-2">
            <label htmlFor={`task-feedback-${taskId}`} className="block text-sm font-medium text-slate-700">What needs to change? *</label>
            <textarea
              id={`task-feedback-${taskId}`}
              className="form-field min-h-20 w-full text-sm"
              maxLength={4000}
              value={feedback}
              onChange={event => setFeedback(event.target.value)}
              placeholder="Tell us what's missing or needs fixing..."
            />
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={saving}
                disabled={saving || !feedback.trim()}
                onClick={() => reviewTask('request_changes')}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Send back
              </Button>
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setRequestingChanges(false); setFeedback('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  if (!assignedToClient) {
    return <p className="text-sm text-slate-500">This task is being handled by the GoPortals team. You can follow its progress here.</p>
  }

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {status !== 'ready_for_review' && (
          <Button variant="secondary" size="sm" loading={saving} disabled={saving}
                  onClick={() => updateStatus('in_progress')}>
            {status === 'in_progress' || status === 'in_system_process' ? 'Continue working' : 'Start task'}
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
