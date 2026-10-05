'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Hand } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'

/** Self-assign an urgent, unassigned task (claim_task RPC — first one wins). */
export function ClaimButton({ taskId, size = 'sm' }: { taskId: string; size?: 'sm' | 'md' }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function claim(e: React.MouseEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await createClient().rpc('claim_task', { p_task_id: taskId })
    setLoading(false)
    if (error) setError(errorMessage(error))
    else router.refresh()
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size={size} variant="lime" loading={loading} onClick={claim}><Hand className="h-4 w-4" /> Pick up</Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
