import { createClient } from '@/lib/supabase/server'
import { getCapacityColor } from '@/lib/utils'
import AdminTeamPanel from '@/components/team/AdminTeamPanel'

export default async function TeamPage() {
  const supabase = createClient()

  // Check if current user is admin
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, is_admin').eq('user_id', user.id).single()
    : { data: null }
  const isAdmin = currentMember?.is_admin ?? false

  const [{ data: members }, { data: allMembers }, { data: tickets }] = await Promise.all([
    supabase.from('team_members').select('*').eq('is_active', true).order('name'),
    // Admin sees all (including inactive)
    isAdmin
      ? supabase.from('team_members').select('id, name, email, role, department, weekly_capacity_hours, is_active, is_admin').order('name')
      : { data: [] },
    supabase
      .from('tickets')
      .select('id, title, status, priority, due_date, assignee_id, estimated_hours, clients(name), platform')
      .in('status', ['open', 'in_progress', 'blocked', 'in_review'])
      .order('priority'),
  ])

  const memberWorkload = members?.map((member) => {
    const memberTickets = tickets?.filter((t) => t.assignee_id === member.id) ?? []
    const usedHours = memberTickets.reduce((sum, t) => sum + (t.estimated_hours ?? 3), 0)
    const pct = Math.round((usedHours / member.weekly_capacity_hours) * 100)
    return { member, tickets: memberTickets, usedHours, pct }
  }) ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Workload</h1>
          <p className="text-sm text-gray-500 mt-0.5">Weekly capacity vs assigned work</p>
        </div>
      </div>

      {/* Admin panel — only visible to admins */}
      {isAdmin && (
        <AdminTeamPanel allMembers={(allMembers ?? []) as any[]} />
      )}

      <div className="space-y-4">
        {memberWorkload.map(({ member, tickets: memberTickets, usedHours, pct }) => (
          <div key={member.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Member header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{member.role?.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-yellow-600' : 'text-gray-700'}`}>
                    {usedHours}h
                  </span>
                  <span className="text-sm text-gray-400"> / {member.weekly_capacity_hours}h</span>
                  <p className="text-xs text-gray-400">{memberTickets.length} tickets</p>
                </div>
              </div>
              {/* Capacity bar */}
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${getCapacityColor(pct)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              {pct >= 100 && (
                <p className="text-xs text-red-500 mt-1">⚠ Over capacity</p>
              )}
            </div>

            {/* Tickets */}
            {memberTickets.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {memberTickets.map((ticket: any) => (
                  <div key={ticket.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                      ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
                      ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
                      ticket.priority === 'P3' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{ticket.priority}</span>
                    <span className="text-sm text-gray-900 flex-1">{ticket.title}</span>
                    <span className="text-xs text-gray-400">{ticket.clients?.name}</span>
                    {ticket.platform && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">{ticket.platform}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                      ticket.status === 'blocked' ? 'bg-red-100 text-red-700' :
                      ticket.status === 'in_review' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{ticket.status.replace('_', ' ')}</span>
                    <span className="text-xs text-gray-400 w-8 text-right">{ticket.estimated_hours}h</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-4 text-sm text-gray-400">No open tickets assigned</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
