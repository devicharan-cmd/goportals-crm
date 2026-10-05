import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/primitives'
import { TicketTable } from '@/components/shared/TicketTable'
import { cn, parseTicketCode } from '@/lib/utils'
import type { Ticket } from '@/types/database'

export const metadata = { title: 'My tickets' }

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Completed' },
  { key: 'all',  label: 'All' },
]

export default async function PortalTicketsPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  await requireClient()
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

  return (
    <>
      <PageHeader
        title="My tickets"
        description="Everything you've asked us to do, and what we're working on for you."
        actions={<ButtonLink href="/portal/tickets/new"><Plus className="h-4 w-4" /> New ticket</ButtonLink>}
      />
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
      </div>
      <Card className="overflow-hidden">
        <TicketTable tickets={(data ?? []) as Ticket[]} empty={{ title: tab === 'done' ? 'Nothing completed yet' : 'No open tickets' }} />
      </Card>
    </>
  )
}
