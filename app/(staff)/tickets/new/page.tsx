import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { PageHeader } from '@/components/ui/primitives'
import { PortalTicketForm } from '@/components/portal/PortalTicketForm'

export const metadata = { title: 'New ticket' }

export default async function NewStaffTicketPage() {
  const me = await requireRole(['super_admin', 'admin'])
  const supabase = createClient()
  const [{ data: clients }, { data: accounts }, { data: platforms }] = await Promise.all([
    supabase.from('clients').select('id, company_name').eq('status', 'active').order('company_name'),
    supabase.from('ecommerce_accounts').select('id, client_id, account_name, platform:platforms(name)').eq('status', 'active'),
    supabase.from('platforms').select('id, name').eq('is_active', true).order('sort_order'),
  ])

  const accountOptions = ((accounts ?? []) as unknown as { id: string; client_id: string; account_name: string; platform: { name: string } | null }[])
    .map(a => ({ id: a.id, client_id: a.client_id, account_name: a.account_name, platform_name: a.platform?.name ?? '' }))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New ticket"
        description="Create a ticket on behalf of a client."
        back={<Link href="/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tickets</Link>}
      />
      <PortalTicketForm accounts={accountOptions} platforms={platforms ?? []} clients={clients ?? []} meId={me.id} hrefBase="/tickets" />
    </div>
  )
}
