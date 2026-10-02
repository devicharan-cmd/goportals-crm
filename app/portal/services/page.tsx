import { Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getMyClientId } from '@/lib/portal'
import { BILLING_LABELS } from '@/lib/constants'
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ClientServiceStatusBadge } from '@/components/ui/badges'
import { formatINR } from '@/lib/utils'
import type { BillingType, ClientServiceStatus } from '@/types/database'

export const metadata = { title: 'My services' }

type Row = {
  id: string
  service_id: string | null
  custom_name: string | null
  status: ClientServiceStatus
  agreed_price: number | null
  currency: string
  billing_type: BillingType
  service: { name: string } | null
  ecommerce_account: { id: string; account_name: string; platform: { name: string } | null } | null
}

type Group = { key: string; title: string; rows: Row[] }

function groupByAccount(rows: Row[]): Group[] {
  const groups = new Map<string, Group>()
  for (const r of rows) {
    const key = r.ecommerce_account?.id ?? 'whole-client'
    const title = r.ecommerce_account
      ? `${r.ecommerce_account.platform?.name ?? 'Unknown platform'} · ${r.ecommerce_account.account_name}`
      : 'Whole client'
    if (!groups.has(key)) groups.set(key, { key, title, rows: [] })
    groups.get(key)!.rows.push(r)
  }
  return Array.from(groups.values()).sort((a, b) => (a.key === 'whole-client' ? 1 : b.key === 'whole-client' ? -1 : 0))
}

export default async function PortalServicesPage() {
  const me = await requireClient()
  const clientId = await getMyClientId(me.id)
  const { data } = await createClient()
    .from('client_services')
    .select(`
      id, service_id, custom_name, status, ecommerce_account_id, agreed_price, currency, billing_type,
      service:services(name),
      ecommerce_account:ecommerce_accounts(id, account_name, platform:platforms(name))
    `)
    .eq('client_id', clientId)
    .order('created_at')
  const rows = (data ?? []) as unknown as Row[]
  const groups = groupByAccount(rows)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My services" description="Every service on your account, active and past, grouped by platform." />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="No services yet" description="Once GoPortals adds a service to your account, it'll show up here." />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(g => (
            <Card key={g.key} className="overflow-hidden">
              <CardHeader title={g.title} />
              <ul className="divide-y divide-slate-100">
                {g.rows.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 truncate text-sm text-slate-800">
                      {r.service_id ? r.service?.name : r.custom_name}
                    </span>
                    <div className="flex flex-shrink-0 items-center gap-3">
                      {r.agreed_price != null && (
                        <span className="text-xs text-slate-500">{formatINR(r.agreed_price)} {BILLING_LABELS[r.billing_type]}</span>
                      )}
                      <ClientServiceStatusBadge status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
