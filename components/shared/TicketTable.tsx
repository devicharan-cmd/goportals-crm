'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/ui/primitives'
import { CompanyAvatar } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_LABELS_CLIENT, TICKET_STATUS_STYLES, TICKET_TERMINAL_STATUSES } from '@/lib/constants'
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { cn, formatDate, ticketCode } from '@/lib/utils'
import type { Ticket } from '@/types/database'

export type TicketListItem = Pick<Ticket, 'id' | 'ticket_number' | 'client_id' | 'category' | 'subject' | 'priority' | 'is_urgent' | 'status' | 'created_at'> & {
  client?: {
    id: string
    company_name: string
    company_profile_image_path?: string | null
    company_profile_image_signed_url?: string | null
  } | null
}

export function TicketTable({
  tickets, hrefBase = '/portal/tickets', showClient = false, empty, audience = 'staff',
}: {
  tickets: TicketListItem[]
  hrefBase?: string
  showClient?: boolean
  empty?: { title: string; description?: string; action?: React.ReactNode }
  /** 'client' swaps in the wording a client should read for each status. */
  audience?: 'staff' | 'client'
}) {
  const router = useRouter()
  const statusLabels = audience === 'client' ? TICKET_STATUS_LABELS_CLIENT : TICKET_STATUS_LABELS
  if (tickets.length === 0) {
    return <div className="ticket-empty-state flex h-[calc(100dvh-176px)] min-h-0 items-center justify-center">
      <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={empty?.title ?? 'No tickets'} description={empty?.description} action={empty?.action} />
    </div>
  }

  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="w-28 whitespace-nowrap px-5 py-3.5">Ticket ID</th>
            <th className="px-3 py-3.5">Ticket title</th>
            {showClient && <th className="w-36 whitespace-nowrap px-3 py-3.5">Client</th>}
            <th className="w-32 whitespace-nowrap px-3 py-3.5">Category</th>
            <th className="w-32 whitespace-nowrap px-3 py-3.5">Status</th>
            <th className="w-24 whitespace-nowrap px-3 py-3.5">Priority</th>
            <th className="w-32 whitespace-nowrap px-5 py-3.5">Raised</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map(t => (
            <tr
              key={t.id}
              onClick={event => {
                if ((event.target as HTMLElement).closest('a, button, input, select, textarea, [role="button"]')) return
                router.push(`${hrefBase}/${t.id}`)
              }}
              className="group cursor-pointer hover:bg-slate-50/80 transition-colors"
            >
              <td className="whitespace-nowrap px-5 py-3.5">
                <Link href={`${hrefBase}/${t.id}`} prefetch={false} className="font-mono text-xs font-semibold text-[#045E80]">{ticketCode(t.ticket_number)}</Link>
              </td>
              <td className="max-w-md px-3 py-3.5">
                <Link href={`${hrefBase}/${t.id}`} prefetch={false} className="flex min-w-0 items-center gap-2">
                  {t.is_urgent && !TICKET_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                  <span className="truncate font-medium text-slate-900">{t.subject}</span>
                </Link>
              </td>
              {showClient && (
                <td className="w-36 whitespace-nowrap px-3 py-3.5 text-slate-600">
                  {t.client ? (
                    <span className="flex items-center gap-2">
                      <CompanyAvatar name={t.client.company_name} src={t.client.company_profile_image_signed_url ?? null} size="xs" />
                      <span className="truncate">{t.client.company_name}</span>
                    </span>
                  ) : '—'}
                </td>
              )}
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
            <Link href={`${hrefBase}/${t.id}`} prefetch={false} className="block px-3 py-2.5 active:bg-slate-50 sm:px-4 sm:py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[13px] font-medium leading-5 text-slate-900"><span className="mr-1.5 font-mono text-[10px] font-semibold text-[#045E80]">{ticketCode(t.ticket_number)}</span>{t.subject}</p>
                {t.priority && <PriorityBadge priority={t.priority} />}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-2 sm:gap-2">
                {t.is_urgent && !TICKET_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                <StatusBadge label={statusLabels[t.status]} className={TICKET_STATUS_STYLES[t.status]} dotClassName={TICKET_STATUS_DOT[t.status]} />
                <span className="text-xs text-slate-500">{TICKET_CATEGORY_LABELS[t.category]}</span>
                {showClient && t.client && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <CompanyAvatar name={t.client.company_name} src={t.client.company_profile_image_signed_url ?? null} size="xs" />
                    {t.client.company_name}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">{formatDate(t.created_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
