'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Marks the other side's messages on this ticket as seen, once, when the page
 * is opened. The RPC ignores messages you wrote yourself and internal notes.
 */
export function MarkMessagesSeen({ ticketId, hasUnseen }: { ticketId: string; hasUnseen: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!hasUnseen) return
    let cancelled = false
    createClient()
      .rpc('mark_ticket_messages_seen', { p_ticket_id: ticketId })
      .then(({ error }) => {
        // Refresh so the sender's ticks update without a manual reload.
        if (!cancelled && !error) router.refresh()
      })
    return () => { cancelled = true }
  }, [ticketId, hasUnseen, router])

  return null
}
