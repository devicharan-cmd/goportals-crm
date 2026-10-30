import Link from 'next/link'
import { ClipboardList, MessageSquareText } from 'lucide-react'
import { EmptyState } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_LABELS_CLIENT, TICKET_STATUS_STYLES, TICKET_TERMINAL_STATUSES } from '@/lib/constants'
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { cn, formatDate, ticketCode } from '@/lib/utils'
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
  const statusLabels = audience === 'client' ? TICKET_STATUS_LABELS_CLIENT : TICKET_STATUS_LABELS
  const showMessages = !!unreadByTicket
  if (tickets.length === 0) {
    return <EmptyState icon={ClipboardList} title={empty?.title ?? 'No tickets'} description={empty?.description} action={empty?.action} />
  }

  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="px-5 py-3">Ticket</th>
            {showClient && <th className="px-3 py-3">Client</th>}
            {showMessages && <th className="py-3 pl-3 pr-14 text-center"><span className="sr-only">Messages</span></th>}
            <th className="px-3 py-3">Category</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Priority</th>
            <th className="px-5 py-3">Raised</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map(t => (
            <tr key={t.id} className="group hover:bg-slate-50/80">
              <td className="max-w-md px-5 py-3">
                <Link href={`${hrefBase}/${t.id}`} className="block">
                  <span className="flex items-center gap-2">
                    <span className="flex-shrink-0 font-mono text-xs font-semibold text-slate-400">{ticketCode(t.ticket_number)}</span>
                    {t.is_urgent && !TICKET_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                    <span className="truncate font-medium text-slate-900 group-hover:text-brand-700">{t.subject}</span>
                  </span>
                </Link>
              </td>
              {showClient && <td className="px-3 py-3 text-slate-600">{t.client?.company_name ?? '—'}</td>}
              {showMessages && (
                <td className="py-3 pl-3 pr-14 text-center">
                  <Link href={`${hrefBase}/${t.id}#conversation`} className="inline-flex" aria-label="Open the conversation">
                    <UnreadMessages count={unreadByTicket?.[t.id] ?? 0} />
                  </Link>
                </td>
              )}
              <td className="whitespace-nowrap px-3 py-3 text-slate-600">{TICKET_CATEGORY_LABELS[t.category]}</td>
              <td className="px-3 py-3"><StatusBadge label={statusLabels[t.status]} className={TICKET_STATUS_STYLES[t.status]} dotClassName={TICKET_STATUS_DOT[t.status]} /></td>
              <td className="px-3 py-3">{t.priority ? <PriorityBadge priority={t.priority} /> : <span className="text-xs text-slate-400">—</span>}</td>
              <td className="px-5 py-3 text-xs text-slate-500">{formatDate(t.created_at)}</td>
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
                <UnreadMessages count={unreadByTicket?.[t.id] ?? 0} />
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
