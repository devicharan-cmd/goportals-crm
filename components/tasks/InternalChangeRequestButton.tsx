'use client'

import { RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { errorMessage } from '@/lib/utils'
import { useSingleFlight } from '@/components/shared/useSingleFlight'
import { useState } from 'react'

export function InternalChangeRequestButton({ taskId }: { taskId: string }) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function requestChanges() {
    const feedback = window.prompt('What needs to be changed? (optional)')
    if (feedback === null) return
    setSaving(true)
    setError('')
    const { error: requestError } = await createClient().rpc('request_multi_assignee_task_changes', {
      p_task_id: taskId,
      p_feedback: feedback.trim() || null,
    })
    setSaving(false)
    if (requestError) {
      setError(errorMessage(requestError))
      return
    }
    router.refresh()
  }

  return (
    <div className="mt-3">
      <Button variant="secondary" size="sm" loading={saving} disabled={saving}
        onClick={() => void runOnce('internal-change-request', requestChanges)}>
        <RotateCcw className="h-3.5 w-3.5" /> Request changes
      </Button>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
