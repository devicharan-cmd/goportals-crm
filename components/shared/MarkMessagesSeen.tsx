'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Marks the other side's messages on this ticket as seen, once, when the page
 * is opened. The RPC records each reader's own timestamp and ignores messages
 * written by themselves or internal notes they cannot see.
 */
export function MarkMessagesSeen({ ticketId, hasUnseen = true }: { ticketId: string; hasUnseen?: boolean }) {
  const router = useRouter()
  const calledRef = useRef(false)

  useEffect(() => {
    if (!hasUnseen || calledRef.current) return
    calledRef.current = true
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
