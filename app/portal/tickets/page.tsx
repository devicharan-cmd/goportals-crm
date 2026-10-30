import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { TicketTable } from '@/components/shared/TicketTable'
import { cn, parseTicketCode } from '@/lib/utils'
import { clientPortalTicketStatus } from '@/lib/ticket-status'
import type { Ticket } from '@/types/database'

export const metadata = { title: 'My tickets' }

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Completed' },
  { key: 'all',  label: 'All' },
]

export default async function PortalTicketsPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const me = await requireClient()
  const supabase = createClient()
  const tab = TABS.some(t => t.key === searchParams.status) ? searchParams.status! : 'open'

  let query = supabase.from('tickets').select('*').order('created_at', { ascending: false })
  const idSearch = parseTicketCode(searchParams.q)
  if (idSearch) query = query.eq('ticket_number', idSearch)
  else {
    if (searchParams.q) query = query.ilike('subject', `%${searchParams.q.replace(/[%_,()]/g, ' ')}%`)
    if (tab === 'open') query = query.neq('status', 'closed')
    if (tab === 'done') query = query.eq('status', 'closed')
  }
  const { data } = await query
  const tickets = (data ?? []) as Ticket[]
  const portalTickets = tickets.map(ticket => ({
    ...ticket,
    status: clientPortalTicketStatus(ticket),
  }))

  // Counted for this reader alone: somebody else opening a ticket must not
  // clear the badge on everyone's list.
  const { data: unseen, error: rpcErr } = await supabase.rpc('my_unread_ticket_messages')
  let unreadByTicket: Record<string, number> = {}
  if (!rpcErr && unseen) {
    unreadByTicket = Object.fromEntries(((unseen as { ticket_id: string; unread: number }[]).map(r => [r.ticket_id, r.unread])))
  } else {
    const { data: legacyUnseen } = await supabase
      .from('ticket_comments').select('ticket_id').is('seen_at', null).neq('author_id', me.id).eq('is_internal', false)
    unreadByTicket = (legacyUnseen ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.ticket_id] = (acc[row.ticket_id] ?? 0) + 1
      return acc
    }, {})
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {TABS.map(t => (
            <Link key={t.key} href={t.key === 'open' ? '/portal/tickets' : `/portal/tickets?status=${t.key}`}
                  className={cn('rounded-md px-3 py-1 font-medium', tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              {t.label}
            </Link>
          ))}
        </div>
        <form className="relative min-w-[220px] flex-1 sm:max-w-xs">
          {tab !== 'open' && <input type="hidden" name="status" value={tab} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={searchParams.q} placeholder="Search subject or TK-1024…" className="input h-9 pl-9" />
        </form>
        <ButtonLink href="/portal/tickets/new" size="sm" className="ml-auto"><Plus className="h-3.5 w-3.5" /> New ticket</ButtonLink>
      </div>
      <Card className="overflow-hidden">
        <TicketTable tickets={portalTickets} audience="client" unreadByTicket={unreadByTicket} empty={{ title: tab === 'done' ? 'Nothing completed yet' : 'No open tickets' }} />
      </Card>
    </>
  )
}
