'use client'

import { useEffect, useRef, useState } from 'react'
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
  const actionInFlight = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [requestStarted, setRequestStarted] = useState(false)
  const [approved, setApproved] = useState(false)
  const [pendingStatusFrom, setPendingStatusFrom] = useState<TaskStatus | null>(null)

  useEffect(() => {
    function cancelRequest(event: Event) {
      const detail = (event as CustomEvent<{ taskId: string }>).detail
      if (detail?.taskId === taskId) setRequestStarted(false)
    }
    window.addEventListener('task-request-changes-cancelled', cancelRequest)
    return () => window.removeEventListener('task-request-changes-cancelled', cancelRequest)
  }, [taskId])

  useEffect(() => {
    if (status !== 'client_review' && status !== 'completed') setRequestStarted(false)
    if (pendingStatusFrom !== null && status !== pendingStatusFrom) setPendingStatusFrom(null)
    if (status !== 'client_review') {
      setApproved(false)
      actionInFlight.current = false
    }
  }, [pendingStatusFrom, status])

  async function updateStatus(nextStatus: TaskStatus) {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setSaving(true)
    setError('')
    const { data, error: updateError } = await createClient().from('tasks')
      .update({ status: nextStatus })
      .eq('id', taskId)
      .select('id')
      .maybeSingle()
    setSaving(false)
    if (updateError) {
      actionInFlight.current = false
      return setError(errorMessage(updateError))
    }
    if (!data) {
      actionInFlight.current = false
      return setError('This task could not be updated. Refresh the page and try again.')
    }
    actionInFlight.current = false
    if (nextStatus !== status) setPendingStatusFrom(status)
    router.refresh()
  }

  async function approveTask() {
    if (actionInFlight.current || approved) return
    actionInFlight.current = true
    setSaving(true)
    setError('')
    const { error: actionError } = await createClient().rpc('client_approve_task', { p_task_id: taskId })
    setSaving(false)
    if (actionError) {
      actionInFlight.current = false
      return setError(errorMessage(actionError))
    }
    setApproved(true)
    router.refresh()
  }

  function requestChanges() {
    setError('')
    setRequestStarted(true)
    window.dispatchEvent(new CustomEvent('task-request-changes', { detail: { taskId } }))
  }

  if (status === 'cancelled') {
    return <p className="text-sm text-slate-500">This task is {TASK_STATUS_LABELS[status].toLowerCase()}.</p>
  }

  if (status === 'client_review' || status === 'completed') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {status === 'client_review'
            ? 'Review the completed work and approve it, or send it back with feedback.'
            : 'Need more work on this task? Request changes and send your feedback in the discussion.'}
        </p>
        <div className="flex flex-nowrap gap-2">
          {status === 'client_review' && (
            <Button size="sm" className="w-[118px] shrink-0 whitespace-nowrap" loading={saving} disabled={saving || approved} onClick={() => void approveTask()}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve task
            </Button>
          )}
          <Button
            variant="lime"
            size="sm"
            disabled={saving || requestStarted || approved}
            className="shrink-0 whitespace-nowrap text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
            onClick={requestChanges}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Request changes
          </Button>
        </div>
        {approved
          ? <p role="status" className="text-sm text-emerald-700">Task approved.</p>
          : error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
          <Button variant="secondary" size="sm" loading={saving || pendingStatusFrom !== null} disabled={saving || pendingStatusFrom !== null}
                  onClick={() => updateStatus('in_progress')}>
            {status === 'in_progress' || status === 'in_system_process' ? 'Continue working' : 'Start task'}
          </Button>
        )}
        {status !== 'ready_for_review' ? (
          <Button size="sm" loading={saving || pendingStatusFrom !== null} disabled={saving || pendingStatusFrom !== null} onClick={() => updateStatus('ready_for_review')}>
            Submit for review
          </Button>
        ) : (
          <Button variant="secondary" size="sm" loading={saving || pendingStatusFrom !== null} disabled={saving || pendingStatusFrom !== null}
                  onClick={() => updateStatus('in_progress')}>
            Continue working
          </Button>
        )}
      </div>
      {status === 'ready_for_review' && <p className="text-xs text-slate-500">The GoPortals team will review your submission.</p>}
    </div>
  )
}
