'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ClipboardList, MessageSquareText } from 'lucide-react'
import { EmptyState } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_LABELS_CLIENT, TICKET_STATUS_STYLES, TICKET_TERMINAL_STATUSES } from '@/lib/constants'
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { cn, formatDate, ticketCode } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Ticket } from '@/types/database'

export type TicketListItem = Ticket & { client?: { id: string; company_name: string } | null }

/**
 * Unread messages on a ticket: the count rides the corner of a chat icon, the
 * way the notification bell carries its own. Nothing is shown at zero.
 */
function UnreadMessages({ count }: { count: number }) {
  return (
    <span className="relative inline-flex flex-shrink-0"
          title={count ? `${count} unread message${count === 1 ? '' : 's'}` : 'Open the conversation'}>
      <MessageSquareText strokeWidth={2.5} className={cn('h-5 w-5', count ? 'text-slate-700' : 'text-slate-400')} />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime-500 px-1 text-[10px] font-bold text-brand-950">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </span>
  )
}

export function TicketTable({
  tickets, hrefBase = '/portal/tickets', showClient = false, empty, audience = 'staff', unreadByTicket,
}: {
  tickets: TicketListItem[]
  hrefBase?: string
  showClient?: boolean
  empty?: { title: string; description?: string; action?: React.ReactNode }
  /** 'client' swaps in the wording a client should read for each status. */
  audience?: 'staff' | 'client'
  /** Unread message count per ticket id; omit to show none. */
  unreadByTicket?: Record<string, number>
}) {
  const router = useRouter()
  const [liveUnreadByTicket, setLiveUnreadByTicket] = useState(unreadByTicket ?? {})
  const showMessages = unreadByTicket !== undefined

  // Keep the per-reader message badges current while this list remains open.
  // The database RPC is the authority; polling refreshes only counts and never
  // changes the read state, which is cleared by opening the conversation.
  useEffect(() => {
    if (!showMessages) return
    const supabase = createClient()
    let disposed = false
    const refresh = async () => {
      const { data, error } = await supabase.rpc('my_unread_ticket_messages')
      if (disposed || error || !data) return
      const next = Object.fromEntries((data as { ticket_id: string; unread: number }[]).map(row => [row.ticket_id, row.unread]))
      setLiveUnreadByTicket(next)
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 5000)
    return () => { disposed = true; window.clearInterval(interval) }
  }, [showMessages])

  const statusLabels = audience === 'client' ? TICKET_STATUS_LABELS_CLIENT : TICKET_STATUS_LABELS
  if (tickets.length === 0) {
    return <EmptyState icon={ClipboardList} title={empty?.title ?? 'No tickets'} description={empty?.description} action={empty?.action} />
  }

  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="px-5 py-3.5">Ticket</th>
            {showMessages && <th className={cn('px-3 py-3.5 text-center whitespace-nowrap', showClient ? 'w-24' : 'w-28')}><span className="sr-only">Messages</span></th>}
            {showClient && <th className="w-36 whitespace-nowrap px-3 py-3.5">Client</th>}
            <th className="w-32 whitespace-nowrap px-3 py-3.5">Category</th>
            <th className="w-32 whitespace-nowrap px-3 py-3.5">Status</th>
            <th className="w-24 whitespace-nowrap px-3 py-3.5">Priority</th>
            <th className="w-32 whitespace-nowrap px-5 py-3.5">Raised</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map(t => (
            <tr key={t.id} className="group hover:bg-slate-50/80">
              <td className="max-w-md px-5 py-3.5">
                <Link href={`${hrefBase}/${t.id}`} className="block">
                  <span className="flex items-center gap-2">
                    <span className="flex-shrink-0 font-mono text-xs font-semibold text-slate-400">{ticketCode(t.ticket_number)}</span>
                    {t.is_urgent && !TICKET_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                    <span className="truncate font-medium text-slate-900 group-hover:text-brand-700">{t.subject}</span>
                  </span>
                </Link>
              </td>
              {showMessages && (
                <td className={cn('px-3 py-3.5 text-center whitespace-nowrap', showClient ? 'w-24' : 'w-28')}>
                  <button
                    type="button"
                    onClick={() => router.push(`${hrefBase}/${t.id}`)}
                    className="inline-flex"
                    aria-label="Open the ticket"
                  >
                    <UnreadMessages count={liveUnreadByTicket[t.id] ?? 0} />
                  </button>
                </td>
              )}
              {showClient && <td className="w-36 whitespace-nowrap truncate px-3 py-3.5 text-slate-600">{t.client?.company_name ?? '—'}</td>}
              <td className="w-32 whitespace-nowrap truncate px-3 py-3.5 text-slate-600">{TICKET_CATEGORY_LABELS[t.category]}</td>
              <td className="w-32 whitespace-nowrap px-3 py-3.5"><StatusBadge label={statusLabels[t.status]} className={TICKET_STATUS_STYLES[t.status]} dotClassName={TICKET_STATUS_DOT[t.status]} /></td>
              <td className="w-24 whitespace-nowrap px-3 py-3.5">{t.priority ? <PriorityBadge priority={t.priority} /> : <span className="text-xs text-slate-400">—</span>}</td>
              <td className="w-32 whitespace-nowrap px-5 py-3.5 text-xs text-slate-500">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 md:hidden">
        {tickets.map(t => (
          <li key={t.id}>
            <Link href={`${hrefBase}/${t.id}`} className="block px-4 py-3 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs font-semibold text-slate-400">{ticketCode(t.ticket_number)}</span>{t.subject}</p>
                {t.priority && <PriorityBadge priority={t.priority} />}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.is_urgent && !TICKET_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                <StatusBadge label={statusLabels[t.status]} className={TICKET_STATUS_STYLES[t.status]} dotClassName={TICKET_STATUS_DOT[t.status]} />
                <UnreadMessages count={liveUnreadByTicket[t.id] ?? 0} />
                <span className="text-xs text-slate-500">{TICKET_CATEGORY_LABELS[t.category]}</span>
                {showClient && t.client && <span className="text-xs text-slate-500">{t.client.company_name}</span>}
                <span className="ml-auto text-xs text-slate-400">{formatDate(t.created_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
