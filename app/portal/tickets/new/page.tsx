import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { PageHeader } from '@/components/ui/primitives'
import { PortalTicketForm } from '@/components/portal/PortalTicketForm'

export const metadata = { title: 'New ticket' }

export default async function NewPortalTicketPage() {
  const me = await requireClient()
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id').eq('owner_id', me.id).single()
  const [{ data: accounts }, { data: platforms }] = await Promise.all([
    supabase.from('ecommerce_accounts')
      .select('id, account_name, platform:platforms(name)').eq('client_id', client!.id).eq('status', 'active'),
    supabase.from('platforms').select('id, name').eq('is_active', true).order('sort_order'),
  ])

  const options = ((accounts ?? []) as unknown as { id: string; account_name: string; platform: { name: string } | null }[])
    .map(a => ({ id: a.id, account_name: a.account_name, platform_name: a.platform?.name ?? '' }))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New ticket"
        description="Tell us what you need. Our team is notified straight away."
        back={<Link href="/portal/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> My tickets</Link>}
      />
      <PortalTicketForm accounts={options} platforms={platforms ?? []} meId={me.id} />
    </div>
  )
}
