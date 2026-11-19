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
  const me = await requireRole(['super_admin', 'manager', 'team_lead'])
  const supabase = await createClient()
  const tab = TABS.find(t => t.key === searchParams.status)?.key ?? 'unassigned'
  // Keep the paged row query independent from the exact tab count. Combining
  // the count with a client embed makes PostgREST count the filtered joined
  // result before it can return this small first page.
  const ticketQueryPromise = supabase.from('tickets')
    .select(STAFF_TICKET_LIST_SELECT)
    .eq('status', tab)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(0, TICKET_PAGE_SIZE)
  const countQueriesPromise = Promise.all(TABS.map(({ key }) => supabase.from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', key)))
  const [ticketResult, countResults] = await Promise.all([
    ticketQueryPromise,
    countQueriesPromise,
  ])
  const { data, error } = ticketResult
  if (error) throw error
  for (const result of countResults) {
    if (result.error) throw result.error
  }
  const ticketCounts = Object.fromEntries(TABS.map((item, index) => [
    item.key,
    countResults[index].count ?? 0,
  ])) as Record<(typeof TABS)[number]['key'], number>
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
      <div className="lg:-mx-2">
        <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
          <StaffTicketTabs activeStatus={tab} initialCounts={ticketCounts} />
          <TicketSearchField className="min-w-[220px] flex-1 sm:max-w-xs" />
          {me.role !== 'team_lead' && (
            <ButtonLink href="/tickets/new" prefetch={false} size="sm" className="ml-auto"><Plus className="h-3.5 w-3.5" /> New ticket</ButtonLink>
          )}
        </div>
        <TicketSearchResults />
      </div>
    </TicketSearchProvider>
  )
}
