import Link from 'next/link'
import { Building2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Avatar, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { AccountStatusBadge } from '@/components/ui/badges'
import { ClientFormModal } from '@/components/clients/ClientFormModal'
import { STAGE_LABELS } from '@/lib/constants'
import { nameMap } from '@/lib/queries'
import type { Client, Platform, Service } from '@/types/database'

export const metadata = { title: 'Clients' }

type Row = Client & {
  client_team: { profile_id: string }[]
}

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const me = await requireRole(['super_admin', 'admin'])
  const supabase = createClient()

  let query = supabase.from('clients')
    .select('*, client_team(profile_id)')
    .order('company_name')
  if (searchParams.q) query = query.ilike('company_name', `%${searchParams.q.replace(/[%_,()]/g, ' ')}%`)
  if (searchParams.status) query = query.eq('status', searchParams.status)

  const [{ data }, { data: openTasks }, { data: people }, { data: platforms }, { data: services }] = await Promise.all([
    query,
    supabase.from('tasks').select('client_id').not('status', 'in', '(completed,cancelled)'),
    supabase.from('profiles').select('id, full_name, email'),
    supabase.from('platforms').select('*').order('sort_order'),
    supabase.from('services').select('*').order('sort_order'),
  ])
  const clients = (data ?? []) as Row[]
  const names = nameMap(people ?? [])
  const openCount = (openTasks ?? []).reduce<Record<string, number>>((acc, t: { client_id: string }) => {
    acc[t.client_id] = (acc[t.client_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${clients.length} brand${clients.length === 1 ? '' : 's'}`}
        actions={['super_admin', 'admin'].includes(me.role) && <ClientFormModal canEditInternal platforms={(platforms ?? []) as Platform[]} services={(services ?? []) as Service[]} />}
      />

      <form className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={searchParams.q} placeholder="Search clients…" className="input h-9 pl-9" />
        </div>
        <select name="status" defaultValue={searchParams.status ?? ''} className="input h-9 w-auto py-1.5">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200">Filter</button>
      </form>

      <Card className="overflow-hidden">
        {clients.length === 0 ? (
          <EmptyState icon={Building2} title="No clients found" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {clients.map(c => {
              const team = Array.from(new Set(c.client_team.map(t => t.profile_id)))
              return (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50/80 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 font-display text-sm font-bold text-white">
                        {c.company_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{c.company_name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {STAGE_LABELS[c.stage]}{c.contact_name ? ` · ${c.contact_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:w-60 sm:justify-end">
                      <div className="flex -space-x-2">
                        {team.slice(0, 4).map(id => <Avatar key={id} name={names[id]} size="sm" className="ring-2 ring-white" />)}
                      </div>
                      <span className="text-xs text-slate-500">{openCount[c.id] ?? 0} open</span>
                      <AccountStatusBadge status={c.status} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
