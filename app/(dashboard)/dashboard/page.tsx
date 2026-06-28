import { createClient } from '@/lib/supabase/server'
import { BarChart2, Users, Ticket, AlertCircle } from 'lucide-react'
import SendNotificationsButton from '@/components/shared/SendNotificationsButton'

export default async function DashboardPage() {
  const supabase = createClient()

  // Fetch summary counts
  const [{ count: clientCount }, { count: openTickets }, { count: overdueTickets }, { count: memberCount }] =
    await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      supabase.from('tickets').select('*', { count: 'exact', head: true }).lt('due_date', new Date().toISOString()).not('status', 'eq', 'done'),
      supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ])

  // Recent activity
  const { data: recentTickets } = await supabase
    .from('tickets')
    .select('id, title, status, priority, due_date, clients(name), team_members!assignee_id(name)')
    .order('updated_at', { ascending: false })
    .limit(8)

  const stats = [
    { label: 'Active Brands', value: clientCount ?? 0, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Open Tickets', value: openTickets ?? 0, icon: Ticket, color: 'text-purple-600 bg-purple-50' },
    { label: 'Overdue', value: overdueTickets ?? 0, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
    { label: 'Team Size', value: memberCount ?? 0, icon: BarChart2, color: 'text-green-600 bg-green-50' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your agency activity</p>
        </div>
        <SendNotificationsButton />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`inline-flex p-2 rounded-lg ${stat.color} mb-3`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent tickets */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Tickets</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {recentTickets?.map((ticket: any) => (
            <div key={ticket.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
                ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
                ticket.priority === 'P3' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>{ticket.priority}</span>
              <span className="text-sm text-gray-900 flex-1">{ticket.title}</span>
              <span className="text-xs text-gray-400">{ticket.clients?.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                ticket.status === 'done' ? 'bg-green-100 text-green-700' :
                ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                ticket.status === 'blocked' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              }`}>{ticket.status.replace('_', ' ')}</span>
            </div>
          ))}
          {(!recentTickets || recentTickets.length === 0) && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No tickets yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
