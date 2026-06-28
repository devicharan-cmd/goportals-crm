import { createClient } from '@/lib/supabase/server'
import TicketForm from '@/components/tickets/TicketForm'

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: { client_id?: string }
}) {
  const supabase = createClient()

  const [{ data: clients }, { data: members }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('is_active', true).order('name'),
    supabase.from('team_members').select('id, name').eq('is_active', true).order('name'),
  ])

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Ticket</h1>
        <p className="text-sm text-gray-500 mt-1">Create a task, issue, or request</p>
      </div>
      <TicketForm clients={clients ?? []} members={members ?? []} defaultClientId={searchParams.client_id} />
    </div>
  )
}
