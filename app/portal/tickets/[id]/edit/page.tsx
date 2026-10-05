import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { resolveTicketId } from '@/lib/queries'
import { PageHeader } from '@/components/ui/primitives'
import { PortalTicketForm } from '@/components/portal/PortalTicketForm'
import type { Ticket } from '@/types/database'

export const metadata = { title: 'Edit ticket' }

export default async function EditPortalTicketPage({ params }: { params: { id: string } }) {
  const me = await requireClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()
  const supabase = createClient()
  const { data } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle()
  if (!data) notFound()
  const ticket = data as Ticket
  // Editable only while nobody has started it (the DB enforces this too).
  if (ticket.status !== 'new' || ticket.created_by !== me.id) redirect(`/portal/tickets/${ticket.id}`)

  const [{ data: accounts }, { data: platforms }] = await Promise.all([
    supabase.from('ecommerce_accounts')
      .select('id, account_name, platform:platforms(name)').eq('client_id', ticket.client_id).eq('status', 'active'),
    supabase.from('platforms').select('id, name').eq('is_active', true).order('sort_order'),
  ])
  const options = ((accounts ?? []) as unknown as { id: string; account_name: string; platform: { name: string } | null }[])
    .map(a => ({ id: a.id, account_name: a.account_name, platform_name: a.platform?.name ?? '' }))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit ticket"
        back={<Link href={`/portal/tickets/${ticket.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</Link>}
      />
      <PortalTicketForm ticket={ticket} accounts={options} platforms={platforms ?? []} meId={me.id} />
    </div>
  )
}
