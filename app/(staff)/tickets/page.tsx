import Link from 'next/link'
import { KanbanSquare, List, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assigneeOptionsFor, getTicketBoardLookups, nameMap } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { TicketSearchField, TicketSearchProvider, TicketSearchResults } from '@/components/shared/TicketSearch'
import type { TicketListItem } from '@/components/shared/TicketTable'
import { cn } from '@/lib/utils'
import { normalizeTicketStatus } from '@/lib/ticket-status'

export const metadata = { title: 'Tickets' }

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Completed' },
  { key: 'all',  label: 'All' },
] as const

function ticketsHref(status: string, board: boolean) {
  const params = new URLSearchParams()
  if (status !== 'open') params.set('status', status)
  if (board) params.set('view', 'board')
  const query = params.toString()
  return query ? `/tickets?${query}` : '/tickets'
}

export default async function StaffTicketsPage({ searchParams }: { searchParams: { status?: string; view?: string } }) {
  const me = await requireStaff()
  const supabase = createClient()
  const tab = TABS.find(t => t.key === searchParams.status)?.key ?? 'open'
  const board = searchParams.view === 'board'

  let query = supabase.from('tickets').select('*, client:clients(id, company_name)').order('created_at', { ascending: false }).limit(200)
  if (me.role === 'team_lead') query = query.eq('assignee_id', me.id)
  if (tab === 'open') query = query.neq('status', 'closed')
  if (tab === 'done') query = query.eq('status', 'closed')
  const [{ data }, lookups] = await Promise.all([
    query,
    board ? getTicketBoardLookups({ includeAssignments: me.role !== 'employee' }) : Promise.resolve(null),
  ])
  const tickets = ((data ?? []) as TicketListItem[]).map(ticket => ({
    ...ticket,
    status: normalizeTicketStatus(ticket.status),
  }))
  // Counted for this reader alone: somebody else opening a ticket must not
  // clear the badge on everyone's list.
  const { data: unseen } = await supabase.rpc('my_unread_ticket_messages')
  let unreadByTicket: Record<string, number> = {}
  if (unseen) {
    unreadByTicket = Object.fromEntries(((unseen as { ticket_id: string; unread: number }[]).map(r => [r.ticket_id, r.unread])))
  }
  const names = lookups ? nameMap(lookups.people) : {}
  const assignOptions = me.role !== 'employee' && lookups ? assigneeOptionsFor(me, lookups) : undefined

  return (
    <TicketSearchProvider
      initialTickets={tickets}
      unreadByTicket={unreadByTicket}
      audience="staff"
      status={tab}
      board={board}
      names={names}
      assignOptions={assignOptions}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {TABS.map(t => (
            <Link key={t.key} href={ticketsHref(t.key, board)}
                  className={cn('rounded-md px-3 py-1 font-medium', tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="inline-flex h-9 items-center rounded-lg bg-slate-100 p-1">
          {([
            { v: 'list', i: List, l: 'List view', href: ticketsHref(tab, false) },
            { v: 'board', i: KanbanSquare, l: 'Board view', href: ticketsHref(tab, true) },
          ] as const).map(o => (
            <Link key={o.v} href={o.href} aria-label={o.l} title={o.l}
                  className={cn('flex h-7 w-8 items-center justify-center rounded-md transition',
                    (board ? o.v === 'board' : o.v === 'list') ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              <o.i className="h-4 w-4" />
            </Link>
          ))}
        </div>
        <TicketSearchField className="min-w-[220px] flex-1 sm:max-w-xs" />
        {['super_admin', 'admin'].includes(me.role) && (
          <ButtonLink href="/tickets/new" size="sm" className="ml-auto"><Plus className="h-3.5 w-3.5" /> New ticket</ButtonLink>
        )}
      </div>
      <TicketSearchResults />
    </TicketSearchProvider>
  )
}
