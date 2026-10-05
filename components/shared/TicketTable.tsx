import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_STYLES, TICKET_TERMINAL_STATUSES } from '@/lib/constants'
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { formatDate, ticketCode } from '@/lib/utils'
import type { Ticket } from '@/types/database'

export type TicketListItem = Ticket & { client?: { id: string; company_name: string } | null }

export function TicketTable({
  tickets, hrefBase = '/portal/tickets', showClient = false, empty,
}: {
  tickets: TicketListItem[]
  hrefBase?: string
  showClient?: boolean
  empty?: { title: string; description?: string; action?: React.ReactNode }
}) {
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
            <th className="px-3 py-3">Category</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Priority</th>
            <th className="px-5 py-3 text-right">Raised</th>
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
              <td className="px-3 py-3 text-slate-600">{TICKET_CATEGORY_LABELS[t.category]}</td>
              <td className="px-3 py-3"><StatusBadge label={TICKET_STATUS_LABELS[t.status]} className={TICKET_STATUS_STYLES[t.status]} dotClassName={TICKET_STATUS_DOT[t.status]} /></td>
              <td className="px-3 py-3">{t.priority ? <PriorityBadge priority={t.priority} /> : <span className="text-xs text-slate-400">—</span>}</td>
              <td className="px-5 py-3 text-right text-xs text-slate-500">{formatDate(t.created_at)}</td>
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
                <StatusBadge label={TICKET_STATUS_LABELS[t.status]} className={TICKET_STATUS_STYLES[t.status]} dotClassName={TICKET_STATUS_DOT[t.status]} />
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
