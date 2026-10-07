import Link from 'next/link'
import { KanbanSquare, List, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assigneeOptionsFor, getStaffLookups, nameMap } from '@/lib/queries'
import { Card, PageHeader } from '@/components/ui/primitives'
import { ButtonLink } from '@/components/ui/button'
import { TicketTable, type TicketListItem } from '@/components/shared/TicketTable'
import { TicketBoard } from '@/components/tickets/TicketBoard'
import { cn, parseTicketCode } from '@/lib/utils'

export const metadata = { title: 'Tickets' }

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Completed' },
  { key: 'all',  label: 'All' },
]

export default async function StaffTicketsPage({ searchParams }: { searchParams: { status?: string; q?: string; view?: string } }) {
  const me = await requireStaff()
  const supabase = createClient()
  const tab = TABS.some(t => t.key === searchParams.status) ? searchParams.status! : 'open'
  const board = searchParams.view === 'board'

  let query = supabase.from('tickets').select('*, client:clients(id, company_name)').order('created_at', { ascending: false }).limit(200)
  const idSearch = parseTicketCode(searchParams.q)
  if (idSearch) query = query.eq('ticket_number', idSearch)
  else {
    if (searchParams.q) query = query.ilike('subject', `%${searchParams.q.replace(/[%_,()]/g, ' ')}%`)
    if (!board) {
      if (tab === 'open') query = query.neq('status', 'closed')
      if (tab === 'done') query = query.eq('status', 'closed')
    }
  }
  const [{ data }, lookups] = await Promise.all([query, getStaffLookups()])
  const tickets = (data ?? []) as TicketListItem[]
  const names = nameMap(lookups.people)
  const assignOptions = me.role !== 'employee' ? assigneeOptionsFor(me, lookups) : undefined

  return (
    <>
      <PageHeader title="Tickets" description="Tickets raised by clients through the portal."
        actions={['super_admin', 'admin'].includes(me.role) && (
          <ButtonLink href="/tickets/new" size="sm"><Plus className="h-3.5 w-3.5" /> New ticket</ButtonLink>
        )} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!board && (
          <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
            {TABS.map(t => (
              <Link key={t.key} href={t.key === 'open' ? '/tickets' : `/tickets?status=${t.key}`}
                    className={cn('rounded-md px-3 py-1 font-medium', tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                {t.label}
              </Link>
            ))}
          </div>
        )}
        <div className="inline-flex h-9 items-center rounded-lg bg-slate-100 p-1">
          {([
            { v: 'list', i: List, l: 'List view', href: '/tickets' + (tab !== 'open' ? `?status=${tab}` : '') },
            { v: 'board', i: KanbanSquare, l: 'Board view', href: '/tickets?view=board' },
          ] as const).map(o => (
            <Link key={o.v} href={o.href} aria-label={o.l} title={o.l}
                  className={cn('flex h-7 w-8 items-center justify-center rounded-md transition',
                    (board ? o.v === 'board' : o.v === 'list') ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              <o.i className="h-4 w-4" />
            </Link>
          ))}
        </div>
        <form className="relative min-w-[220px] flex-1 sm:max-w-xs">
          {tab !== 'open' && <input type="hidden" name="status" value={tab} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={searchParams.q} placeholder="Search subject or TK-1024…" className="input h-9 pl-9" />
        </form>
      </div>
      {board ? (
        <TicketBoard tickets={tickets} names={names} assignOptions={assignOptions} />
      ) : (
        <Card className="overflow-hidden">
          <TicketTable tickets={tickets} hrefBase="/tickets" showClient
                       empty={{ title: tab === 'done' ? 'Nothing completed yet' : 'No open tickets' }} />
        </Card>
      )}
    </>
  )
}
