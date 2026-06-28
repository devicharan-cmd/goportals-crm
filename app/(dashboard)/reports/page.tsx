import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import ExportPDFButton from '@/components/reports/ExportPDFButton'

export default async function ReportsPage() {
  const supabase = createClient()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { data: allTickets },
    { data: members },
    { data: clients },
  ] = await Promise.all([
    supabase.from('tickets').select('id, status, priority, assignee_id, due_date, closed_at, created_at, estimated_hours, actual_hours'),
    supabase.from('team_members').select('id, name').eq('is_active', true),
    supabase.from('clients').select('id, name, health_score, lifecycle_stage, contract_end').eq('is_active', true),
  ])

  const thisMonth = allTickets?.filter(t => t.created_at >= startOfMonth) ?? []
  const closedThisMonth = allTickets?.filter(t => t.closed_at && t.closed_at >= startOfMonth) ?? []
  const overdue = allTickets?.filter(t =>
    t.due_date && new Date(t.due_date) < now && t.status !== 'done'
  ) ?? []

  const memberStats = members?.map(m => {
    const assigned = allTickets?.filter(t => t.assignee_id === m.id) ?? []
    const closed = assigned.filter(t => t.status === 'done')
    const open = assigned.filter(t => t.status !== 'done')
    const memberOverdue = assigned.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'done')
    return { member: m, assigned: assigned.length, closed: closed.length, open: open.length, overdue: memberOverdue.length }
  }) ?? []

  // Clients expiring in 60 days
  const renewalAlerts = clients?.filter(c => {
    if (!c.contract_end) return false
    const end = new Date(c.contract_end)
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 60
  }) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Agency performance overview — {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="print-hide">
          <ExportPDFButton />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Created This Month', value: thisMonth.length, sub: 'tickets', color: 'text-blue-600' },
          { label: 'Closed This Month', value: closedThisMonth.length, sub: 'tickets', color: 'text-green-600' },
          { label: 'Currently Overdue', value: overdue.length, sub: 'tickets', color: 'text-red-600' },
          { label: 'Renewals in 60d', value: renewalAlerts.length, sub: 'clients', color: 'text-yellow-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`text-3xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-sm text-gray-500 mt-1">{k.label}</div>
            <div className="text-xs text-gray-400">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Team Performance */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Team Performance</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              <th className="px-5 py-3 font-medium text-gray-600">Member</th>
              <th className="px-5 py-3 font-medium text-gray-600 text-center">Assigned</th>
              <th className="px-5 py-3 font-medium text-gray-600 text-center">Closed</th>
              <th className="px-5 py-3 font-medium text-gray-600 text-center">Open</th>
              <th className="px-5 py-3 font-medium text-gray-600 text-center">Overdue</th>
              <th className="px-5 py-3 font-medium text-gray-600">Completion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {memberStats.map(({ member, assigned, closed, open, overdue: od }) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{member.name}</td>
                <td className="px-5 py-3 text-center text-gray-600">{assigned}</td>
                <td className="px-5 py-3 text-center text-green-600 font-medium">{closed}</td>
                <td className="px-5 py-3 text-center text-blue-600">{open}</td>
                <td className="px-5 py-3 text-center">
                  {od > 0 ? <span className="text-red-600 font-medium">{od}</span> : <span className="text-gray-300">0</span>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full"
                        style={{ width: `${assigned > 0 ? Math.round((closed / assigned) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8">
                      {assigned > 0 ? Math.round((closed / assigned) * 100) : 0}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Renewal Alerts */}
      {renewalAlerts.length > 0 && (
        <div className="bg-white rounded-xl border border-yellow-200">
          <div className="px-5 py-4 border-b border-yellow-100 bg-yellow-50 rounded-t-xl">
            <h2 className="font-semibold text-yellow-800">⚠ Contract Renewals Due Soon</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {renewalAlerts.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <span className="font-medium text-gray-900">{c.name}</span>
                <span className="text-sm text-gray-500">Expires {formatDate(c.contract_end)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  new Date(c.contract_end) < new Date(now.getTime() + 14 * 86400000)
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {Math.ceil((new Date(c.contract_end).getTime() - now.getTime()) / 86400000)}d left
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client Health */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Client Health</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {clients?.map((c: any) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3">
              <span className="text-sm font-medium text-gray-900 flex-1">{c.name}</span>
              <span className="text-xs text-gray-400 capitalize">{c.lifecycle_stage}</span>
              {c.health_score != null ? (
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${c.health_score >= 80 ? 'bg-green-500' : c.health_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${c.health_score}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-8 ${c.health_score >= 80 ? 'text-green-600' : c.health_score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {c.health_score}
                  </span>
                </div>
              ) : (
                <span className="text-gray-300 text-sm">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
