import { createClient } from '@/lib/supabase/server'
import { BarChart2, Users, Ticket, AlertCircle } from 'lucide-react'
import SendNotificationsButton from '@/components/shared/SendNotificationsButton'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = createClient()

  const [
    { count: clientCount },
    { count: openTickets },
    { count: overdueTickets },
    { count: memberCount },
  ] = await Promise.all([
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

  // ── NEW: Team member workload for dashboard ──
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, role, avatar_initials')
    .eq('is_active', true)
    .order('name')

  const { data: openTeamTickets } = await supabase
    .from('tickets')
    .select('id, title, status, priority, due_date, assignee_id, clients(name)')
    .not('status', 'eq', 'done')
    .order('due_date', { ascending: true })

  const stats = [
    { label: 'Active Brands', value: clientCount ?? 0, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Open Tickets', value: openTickets ?? 0, icon: Ticket, color: 'text-purple-600 bg-purple-50' },
    { label: 'Overdue', value: overdueTickets ?? 0, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
    { label: 'Team Size', value: memberCount ?? 0, icon: BarChart2, color: 'text-green-600 bg-green-50' },
  ]

  function getDeadlineLabel(dueDateStr: string | null): { label: string; className: string } | null {
    if (!dueDateStr) return null
    const days = Math.round((new Date(dueDateStr).getTime() - new Date().setHours(0,0,0,0)) / 864e5)
    if (days < 0)  return { label: `${Math.abs(days)}d overdue`, className: 'text-red-600' }
    if (days === 0) return { label: 'Due today',                 className: 'text-red-500' }
    if (days <= 3)  return { label: `${days}d left`,             className: 'text-amber-600' }
    return           { label: `${days}d left`,                   className: 'text-gray-400' }
  }

  const statusDot: Record<string, string> = {
    open:              'bg-gray-400',
    in_progress:       'bg-blue-500',
    waiting_on_client: 'bg-amber-400',
    escalated:         'bg-red-500',
    blocked:           'bg-red-500',
    in_review:         'bg-purple-500',
    done:              'bg-green-500',
  }

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

      {/* ── NEW: Team tasks section ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Team — tasks assigned this week
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(teamMembers ?? []).map((member: any) => {
            const memberTickets = (openTeamTickets ?? []).filter(
              (t: any) => t.assignee_id === member.id
            )
            return (
              <div key={member.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Member header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {member.avatar_initials ?? member.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{member.role?.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 shrink-0">
                    {memberTickets.length} tasks
                  </span>
                </div>

                {/* Task list */}
                {memberTickets.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400">No open tasks</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {memberTickets.map((ticket: any) => {
                      const dl = getDeadlineLabel(ticket.due_date)
                      return (
                        <div key={ticket.id} className="flex items-start gap-2.5 px-4 py-2.5">
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot[ticket.status] ?? 'bg-gray-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-800 leading-snug">{ticket.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{(ticket.clients as any)?.name}</p>
                          </div>
                          {dl && (
                            <span className={`text-xs shrink-0 font-medium ${dl.className}`}>
                              {dl.label}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
                ticket.status === 'done'        ? 'bg-green-100 text-green-700' :
                ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                ticket.status === 'blocked'     ? 'bg-red-100 text-red-700' :
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
