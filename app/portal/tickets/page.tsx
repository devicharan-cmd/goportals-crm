import Link from 'next/link'
import { CircleCheck, Plus, TicketCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { TICKET_PAGE_SIZE } from '@/lib/constants'
import { ButtonLink } from '@/components/ui/button'
import { TicketSearchField, TicketSearchProvider, TicketSearchResults } from '@/components/shared/TicketSearch'
import { cn } from '@/lib/utils'
import type { Ticket } from '@/types/database'

export const metadata = { title: 'My tickets' }

const TABS = [
  { key: 'open', label: 'Open', icon: TicketCheck },
  { key: 'done', label: 'Closed', icon: CircleCheck },
] as const

export default async function PortalTicketsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams
  const me = await requireClient()
  const supabase = await createClient()
  const tab = TABS.find(item => item.key === searchParams.status)?.key ?? 'open'

  let query = supabase.from('tickets').select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(0, TICKET_PAGE_SIZE)
  if (tab === 'open') query = query.neq('status', 'closed')
  if (tab === 'done') query = query.eq('status', 'closed')
  const [ticketResult, openCountResult, closedCountResult, unseenResult] = await Promise.all([
    query,
    supabase.from('tickets').select('id', { count: 'exact', head: true }).neq('status', 'closed'),
    supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'closed'),
    // Counted for this reader alone: somebody else opening a ticket must not
    // clear the badge on everyone's list.
    supabase.rpc('my_unread_ticket_messages'),
  ])
  if (ticketResult.error) throw ticketResult.error
  for (const result of [openCountResult, closedCountResult, unseenResult]) {
    if (result.error) throw result.error
  }
  const hasMoreTickets = (ticketResult.data?.length ?? 0) > TICKET_PAGE_SIZE
  const tickets = (ticketResult.data ?? []).slice(0, TICKET_PAGE_SIZE) as Ticket[]
  const lastTicket = tickets[tickets.length - 1]
  const initialTicketCursor = hasMoreTickets && lastTicket
    ? { id: lastTicket.id, created_at: lastTicket.created_at }
    : null
  const ticketCounts = {
    open: openCountResult.count ?? 0,
    done: closedCountResult.count ?? 0,
  }
  const unseen = unseenResult.data
  let unreadByTicket: Record<string, number> = {}
  if (unseen) {
    unreadByTicket = Object.fromEntries(((unseen as { ticket_id: string; unread: number }[]).map(r => [r.ticket_id, r.unread])))
  }

  return (
    <TicketSearchProvider
      initialTickets={tickets}
      initialHasMoreTickets={hasMoreTickets}
      initialTicketCursor={initialTicketCursor}
      audience="client"
      status={tab}
      unreadByTicket={unreadByTicket}
      realtimeUserId={me.id}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="grid h-9 min-w-0 grid-cols-2 gap-px rounded-xl border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]">
          {TABS.map(item => (
            <Link key={item.key}
                  href={item.key === 'open' ? '/portal/tickets' : `/portal/tickets?status=${item.key}`}
                  aria-current={tab === item.key ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full min-w-0 items-center gap-2 rounded-lg px-3 pr-7 text-xs transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
                    tab === item.key
                      ? 'bg-[#034C68] font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
                      : 'bg-white font-medium text-slate-800 hover:bg-slate-50',
                  )}>
              <item.icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', tab === item.key ? 'text-white' : 'text-slate-800')} />
              <span className="min-w-0 truncate">{item.label}</span>
              <span className={cn(
                'absolute right-1 top-1/2 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none shadow-sm',
                ticketCounts[item.key] > 0 ? 'bg-[#95C12C] text-white' : 'bg-slate-200 text-[#0F172A]',
              )}>
                {ticketCounts[item.key] > 99 ? '99+' : ticketCounts[item.key]}
              </span>
            </Link>
          ))}
        </div>
        <TicketSearchField className="min-w-[220px] flex-1 sm:max-w-xs" />
        <ButtonLink href="/portal/tickets/new" size="sm" className="ml-auto"><Plus className="h-3.5 w-3.5" /> New ticket</ButtonLink>
      </div>
      <TicketSearchResults />
    </TicketSearchProvider>
  )
}
