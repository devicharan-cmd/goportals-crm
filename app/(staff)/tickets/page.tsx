import Link from 'next/link'
import { CircleCheck, Layers3, Plus, UsersRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ButtonLink } from '@/components/ui/button'
import { TicketSearchField, TicketSearchProvider, TicketSearchResults } from '@/components/shared/TicketSearch'
import type { TicketListItem } from '@/components/shared/TicketTable'
import { cn } from '@/lib/utils'
import type { TicketStatus } from '@/types/database'

export const metadata = { title: 'Tickets' }

const TABS: { key: TicketStatus; label: string; icon: typeof Layers3 }[] = [
  { key: 'unassigned', label: 'Unassigned', icon: Layers3 },
  { key: 'assigned', label: 'Assigned', icon: UsersRound },
  { key: 'closed', label: 'Closed', icon: CircleCheck },
]

export default async function StaffTicketsPage({ searchParams }: { searchParams: { status?: string } }) {
  const me = await requireRole(['super_admin', 'admin', 'team_lead'])
  const supabase = createClient()
  const tab = TABS.find(t => t.key === searchParams.status)?.key ?? 'unassigned'
  const [ticketResult, ...countResults] = await Promise.all([
    supabase.from('tickets')
      .select('*, client:clients(id, company_name)')
      .eq('status', tab)
      .order('created_at', { ascending: false })
      .limit(200),
    ...TABS.map(({ key }) => supabase.from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', key)),
  ])
  const { data, error } = ticketResult
  if (error) throw error
  for (const result of countResults) {
    if (result.error) throw result.error
  }
  const ticketCounts = Object.fromEntries(TABS.map((item, index) => [item.key, countResults[index].count ?? 0])) as Record<(typeof TABS)[number]['key'], number>

  return (
    <TicketSearchProvider
      initialTickets={(data ?? []) as TicketListItem[]}
      audience="staff"
      status={tab}
    >
      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
        <div className="grid h-9 min-w-0 grid-cols-3 gap-px rounded-xl border border-slate-200 bg-white p-0.5 shadow-card">
          {TABS.map(t => (
            <Link key={t.key} href={t.key === 'unassigned' ? '/tickets' : `/tickets?status=${t.key}`}
              className={cn(
                'relative flex h-full min-w-0 items-center gap-2 rounded-lg px-3 pr-7 text-xs transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
                tab === t.key
                  ? 'bg-brand-700 font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
                  : 'bg-white font-medium text-slate-800',
              )}>
              <t.icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', tab === t.key ? 'text-white' : 'text-slate-800')} />
              <span className="min-w-0 truncate">{t.label}</span>
              <span className={cn(
                'absolute right-1 top-1/2 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none shadow-sm',
                ticketCounts[t.key] > 0 ? 'bg-lime-500 text-white' : 'bg-slate-200 text-[#0F172A]',
              )}>
                {ticketCounts[t.key] > 99 ? '99+' : ticketCounts[t.key]}
              </span>
            </Link>
          ))}
        </div>
        <TicketSearchField className="min-w-[220px] flex-1 sm:max-w-xs" />
        {me.role !== 'team_lead' && (
          <ButtonLink href="/tickets/new" size="sm" className="ml-auto"><Plus className="h-3.5 w-3.5" /> New ticket</ButtonLink>
        )}
      </div>
      <TicketSearchResults />
    </TicketSearchProvider>
  )
}
