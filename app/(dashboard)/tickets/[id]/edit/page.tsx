import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import EditTicketForm from '@/components/tickets/EditTicketForm'

export default async function EditTicketPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: ticket }, { data: clients }, { data: members }] = await Promise.all([
    supabase.from('tickets').select('*').eq('id', params.id).single(),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('team_members').select('id, name').eq('is_active', true).order('name'),
  ])

  if (!ticket) notFound()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href={`/tickets/${params.id}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Ticket</h1>
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{ticket.title}</p>
        </div>
      </div>

      <EditTicketForm
        ticket={ticket}
        clients={clients ?? []}
        members={members ?? []}
      />
    </div>
  )
}
