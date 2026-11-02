import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { ButtonLink } from '@/components/ui/button'
import { TicketSearchField, TicketSearchProvider, TicketSearchResults } from '@/components/shared/TicketSearch'
import { cn } from '@/lib/utils'
import type { Ticket, TicketStatus } from '@/types/database'

export const metadata = { title: 'My tickets' }

const TABS: { key: TicketStatus; label: string }[] = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'closed', label: 'Closed' },
]

export default async function PortalTicketsPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireClient()
  const supabase = createClient()
  const tab = TABS.find(t => t.key === searchParams.status)?.key ?? 'unassigned'

  const { data, error } = await supabase.from('tickets').select('*')
    .eq('status', tab)
    .order('created_at', { ascending: false })
  if (error) throw error
  const tickets = (data ?? []) as Ticket[]
  // Counted for this reader alone: somebody else opening a ticket must not
  // clear the badge on everyone's list.
  const { data: unseen } = await supabase.rpc('my_unread_ticket_messages')
  let unreadByTicket: Record<string, number> = {}
  if (unseen) {
    unreadByTicket = Object.fromEntries(((unseen as { ticket_id: string; unread: number }[]).map(r => [r.ticket_id, r.unread])))
  }

  return (
    <TicketSearchProvider initialTickets={tickets} audience="client" status={tab} unreadByTicket={unreadByTicket}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {TABS.map(t => (
            <Link key={t.key} href={t.key === 'unassigned' ? '/portal/tickets' : `/portal/tickets?status=${t.key}`}
                  className={cn('rounded-md px-3 py-1 font-medium', tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              {t.label}
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
