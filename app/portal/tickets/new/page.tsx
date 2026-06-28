import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalTicketForm from '@/components/portal/PortalTicketForm'

export default async function PortalNewTicketPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientId = user.user_metadata?.client_id as string
  if (!clientId) redirect('/login')

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Submit a Request</h1>
        <p className="text-sm text-gray-500 mt-0.5">Describe what you need and your team will handle it.</p>
      </div>
      <PortalTicketForm clientId={clientId} />
    </div>
  )
}
