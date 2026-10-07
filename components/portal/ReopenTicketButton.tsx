'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'

/** The client rejecting a resolved ticket and sending it back for rework (reopen_ticket RPC). */
export function ReopenTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function reopen() {
    setLoading(true)
    setError('')
    const { error } = await createClient().rpc('reopen_ticket', { p_ticket_id: ticketId, p_feedback: feedback || null })
    setLoading(false)
    if (error) setError(errorMessage(error))
    else router.refresh()
  }

  if (!open) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-orange-50 px-4 py-3 ring-1 ring-inset ring-orange-200">
        <p className="text-sm font-medium text-orange-800">Not quite right? Send it back for changes.</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><RotateCcw className="h-3.5 w-3.5" /> Request changes</Button>
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-orange-50 px-4 py-3 ring-1 ring-inset ring-orange-200">
      <label className="block text-sm font-medium text-orange-800">What needs to change?</label>
      <textarea
        className="input min-h-20 w-full text-sm"
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder="Tell us what's missing or needs fixing..."
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" loading={loading} onClick={reopen}><RotateCcw className="h-3.5 w-3.5" /> Send back</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
