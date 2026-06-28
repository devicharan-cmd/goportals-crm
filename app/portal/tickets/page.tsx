import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'

function TicketRow({ ticket }: { ticket: any }) {
  const isOverdue = ticket.due_date && new Date(ticket.due_date) < new Date() && ticket.status !== 'done'
  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
        ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
        ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
        ticket.priority === 'P3' ? 'bg-blue-100 text-blue-700' :
        'bg-gray-100 text-gray-600'
      }`}>{ticket.priority}</span>
      <span className="text-sm text-gray-900 flex-1">{ticket.title}</span>
      {ticket.platform && <span className="text-xs text-gray-400 capitalize">{ticket.platform}</span>}
      {ticket.deadline_type && ticket.status !== 'done' && (
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
          ticket.deadline_type === 'today' ? 'bg-red-50 text-red-600' :
          ticket.deadline_type === 'this_week' ? 'bg-orange-50 text-orange-600' :
          'bg-blue-50 text-blue-600'
        }`}>
          {ticket.deadline_type === 'today' ? '🔴 Today' :
           ticket.deadline_type === 'this_week' ? '🟠 This Week' : '🔵 This Month'}
        </span>
      )}
      {isOverdue && <span className="text-xs text-red-500 font-medium">Overdue</span>}
      <span className={`text-xs px-2 py-0.5 rounded-full ${
        ticket.status === 'done'        ? 'bg-green-100 text-green-700' :
        ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
        ticket.status === 'blocked'     ? 'bg-red-100 text-red-700' :
        ticket.status === 'in_review'   ? 'bg-purple-100 text-purple-700' :
        'bg-gray-100 text-gray-600'
      }`}>{ticket.status.replace(/_/g, ' ')}</span>
    </div>
  )
}

export default async function PortalTicketsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientId = user.user_metadata?.client_id as string
  if (!clientId) redirect('/login')

  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, title, status, priority, platform, due_date, deadline_type, external_ref, created_at, assignee:team_members!assignee_id(name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  const open = (tickets ?? []).filter((t: any) => t.status !== 'done')
  const done = (tickets ?? []).filter((t: any) => t.status === 'done')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-sm text-gray-500 mt-0.5">{open.length} open · {done.length} completed</p>
        </div>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Submit Request
        </Link>
      </div>

      {open.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Open ({open.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {open.map((t: any) => <TicketRow key={t.id} ticket={t} />)}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Completed ({done.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {done.map((t: any) => <TicketRow key={t.id} ticket={t} />)}
          </div>
        </div>
      )}

      {(!tickets || tickets.length === 0) && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center text-sm text-gray-400">
          No tickets yet.{' '}
          <Link href="/portal/tickets/new" className="text-blue-600 hover:underline">Submit your first request →</Link>
        </div>
      )}
    </div>
  )
}
