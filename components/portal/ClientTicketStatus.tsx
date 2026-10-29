'use client'

import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { StatusBadge } from '@/components/ui/badges'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS_CLIENT, TICKET_STATUS_STYLES } from '@/lib/constants'
import type { TicketStatus } from '@/types/database'

export function ClientTicketStatusBadge({ status }: { status: TicketStatus }) {
  const labelStatus = status === 'awaiting_clarification' ? 'under_review' : status
  return <StatusBadge label={TICKET_STATUS_LABELS_CLIENT[labelStatus]} className={TICKET_STATUS_STYLES[labelStatus]} dotClassName={TICKET_STATUS_DOT[labelStatus]} />
}

export function ClientReplyBadge({ ticketId, authorName }: { ticketId: string; authorName: string | null }) {
  const [name, setName] = useState(authorName)

  useEffect(() => setName(authorName), [authorName])
  useEffect(() => {
    const replied = (event: Event) => {
      if ((event as CustomEvent<{ ticketId: string }>).detail?.ticketId === ticketId) setName(null)
    }
    window.addEventListener('ticket-client-replied', replied)
    return () => window.removeEventListener('ticket-client-replied', replied)
  }, [ticketId])

  if (!name) return null
  return (
    <a href="#conversation" className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
      <MessageSquareText className="h-3.5 w-3.5" /> {name} is awaiting your reply
    </a>
  )
}
