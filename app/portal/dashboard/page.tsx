import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LIFECYCLE_STAGE_LABELS, SERVICE_TYPE_LABELS } from '@/types'

export default async function PortalDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientId = user.user_metadata?.client_id as string
  if (!clientId) redirect('/login')

  const [{ data: client }, { data: tickets }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    supabase
      .from('tickets')
      .select('id, title, status, priority, platform, due_date, deadline_type, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (!client) redirect('/login')

  const openCount  = tickets?.filter(t => !['done'].includes(t.status)).length ?? 0
  const doneCount  = tickets?.filter(t => t.status === 'done').length ?? 0
  const overdueCount = tickets?.filter(t =>
    t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done'
  ).length ?? 0

  return (
    <div className="space-y-6">
      {/* Brand header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm text-gray-500">
                {SERVICE_TYPE_LABELS[client.service_type as keyof typeof SERVICE_TYPE_LABELS]}
              </span>
              <span className="text-gray-300">·</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                client.lifecycle_stage === 'onboarding' ? 'bg-yellow-100 text-yellow-700' :
                client.lifecycle_stage === 'scale' ? 'bg-green-100 text-green-700' :
                client.lifecycle_stage === 'retention' ? 'bg-purple-100 text-purple-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {LIFECYCLE_STAGE_LABELS[client.lifecycle_stage as keyof typeof LIFECYCLE_STAGE_LABELS]}
              </span>
            </div>
          </div>
          {client.health_score != null && (
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Account Health</p>
              <span className={`text-3xl font-bold ${
                client.health_score >= 80 ? 'text-green-600' :
                client.health_score >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}>{client.health_score}</span>
              <span className="text-gray-400 text-sm">/100</span>
            </div>
          )}
        </div>

        {/* Contract info */}
        {(client.contract_start || client.contract_end) && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6 text-sm">
            {client.contract_start && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Contract Start</p>
                <p className="font-medium">{new Date(client.contract_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            )}
            {client.contract_end && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Contract End</p>
                <p className="font-medium">{new Date(client.contract_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            )}
            {client.monthly_retainer && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Monthly Retainer</p>
                <p className="font-medium">₹{client.monthly_retainer.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open Tickets',  value: openCount,    color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Overdue',       value: overdueCount, color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Completed',     value: doneCount,    color: 'text-green-600',  bg: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-5`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent tickets */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Tickets</h2>
          <Link href="/portal/tickets" className="text-sm text-blue-600 hover:text-blue-700">View all →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {tickets?.map((ticket: any) => (
            <div key={ticket.id} className="flex items-center gap-3 px-5 py-3">
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
                ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
                ticket.priority === 'P3' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>{ticket.priority}</span>
              <span className="text-sm text-gray-900 flex-1">{ticket.title}</span>
              {ticket.platform && <span className="text-xs text-gray-400 capitalize">{ticket.platform}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                ticket.status === 'done' ? 'bg-green-100 text-green-700' :
                ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                ticket.status === 'blocked' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              }`}>{ticket.status.replace('_', ' ')}</span>
            </div>
          ))}
          {(!tickets || tickets.length === 0) && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No tickets yet</div>
          )}
        </div>
      </div>

      {/* Submit request CTA */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">Have a request or issue?</p>
          <p className="text-sm text-gray-500 mt-0.5">Submit it and your team will pick it up.</p>
        </div>
        <Link
          href="/portal/tickets/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          Submit Request
        </Link>
      </div>
    </div>
  )
}
