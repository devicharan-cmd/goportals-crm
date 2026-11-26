import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { TICKET_PAGE_SIZE } from '@/lib/constants'
import { ButtonLink } from '@/components/ui/button'
import { TicketSearchField, TicketSearchProvider, TicketSearchResults } from '@/components/shared/TicketSearch'
import type { TicketListItem } from '@/components/shared/TicketTable'
import { STAFF_TICKET_LIST_SELECT } from '@/lib/queries'
import { StaffTicketTabs } from '@/components/tickets/StaffTicketTabs'

export const metadata = { title: 'Tickets' }

type StaffTicketStatus = 'unassigned' | 'assigned' | 'closed'
const TABS: { key: StaffTicketStatus; label: string }[] = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'closed', label: 'Closed' },
]

type TicketClientSummary = { id: string; company_name: string; company_profile_image_path: string | null }

function ticketClientSummary(ticket: { client?: unknown }): TicketClientSummary | null {
  const embedded = ticket.client as TicketClientSummary | TicketClientSummary[] | null | undefined
  return Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null
}

export default async function StaffTicketsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const tab = TABS.find(t => t.key === searchParams.status)?.key ?? 'unassigned'
  // Keep tab totals out of the blocking server render. They load in the tab
  // component after the ticket page is interactive.
  const ticketQueryPromise = supabase.from('tickets')
    .select(STAFF_TICKET_LIST_SELECT)
    .eq('status', tab)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(0, TICKET_PAGE_SIZE)
  // The page guard and the RLS-protected ticket query do not depend on each
  // other. Run them together so a profile lookup doesn't add another network
  // round trip before the ticket request can start.
  const [me, ticketResult] = await Promise.all([
    requireRole(['super_admin', 'manager', 'team_lead']),
    ticketQueryPromise,
  ])
  const { data, error } = ticketResult
  if (error) throw error
  const hasMoreTickets = (data?.length ?? 0) > TICKET_PAGE_SIZE
  const pageTickets = (data ?? []).slice(0, TICKET_PAGE_SIZE)
  const lastTicket = pageTickets[pageTickets.length - 1]
  const initialTicketCursor = hasMoreTickets && lastTicket
    ? { id: lastTicket.id, created_at: lastTicket.created_at }
    : null
  const ticketsWithClientImages = pageTickets.map(ticket => {
    const client = ticketClientSummary(ticket)
    return {
      ...ticket,
      client: client ? {
        ...client,
        company_profile_image_signed_url: null,
      } : null,
    }
  }) as TicketListItem[]

  return (
    <TicketSearchProvider
      initialTickets={ticketsWithClientImages}
      initialHasMoreTickets={hasMoreTickets}
      initialTicketCursor={initialTicketCursor}
      audience="staff"
      status={tab}
    >
      <div className="-mb-4">
        <div className="ticket-filters-toolbar mb-3 flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-[var(--crm-sidebar-bg)] p-3 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="w-full min-w-0 overflow-x-auto sm:contents"><StaffTicketTabs activeStatus={tab} /></div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
            <TicketSearchField className="min-w-0 flex-1 sm:max-w-xs" />
            {me.role !== 'team_lead' && (
              <ButtonLink href="/tickets/new" prefetch={false} size="sm" className="shrink-0 whitespace-nowrap"><Plus className="h-3.5 w-3.5" /> New ticket</ButtonLink>
            )}
          </div>
        </div>
        <TicketSearchResults />
      </div>
    </TicketSearchProvider>
  )
}
