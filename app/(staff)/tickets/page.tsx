import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ButtonLink } from '@/components/ui/button'
import { TicketSearchField, TicketSearchProvider, TicketSearchResults } from '@/components/shared/TicketSearch'
import type { TicketListItem } from '@/components/shared/TicketTable'
import { cn } from '@/lib/utils'
import type { TicketStatus } from '@/types/database'

export const metadata = { title: 'Tickets' }

const TABS: { key: TicketStatus; label: string }[] = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'closed', label: 'Closed' },
]

export default async function StaffTicketsPage({ searchParams }: { searchParams: { status?: string } }) {
  const me = await requireRole(['super_admin', 'admin', 'team_lead'])
  const supabase = createClient()
  const tab = TABS.find(t => t.key === searchParams.status)?.key ?? 'unassigned'
  const { data, error } = await supabase.from('tickets')
    .select('*, client:clients(id, company_name)')
    .eq('status', tab)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error

  return (
    <TicketSearchProvider
      initialTickets={(data ?? []) as TicketListItem[]}
      audience="staff"
      status={tab}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {TABS.map(t => (
            <Link key={t.key} href={t.key === 'unassigned' ? '/tickets' : `/tickets?status=${t.key}`}
                  className={cn('rounded-md px-3 py-1 font-medium', tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              {t.label}
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
