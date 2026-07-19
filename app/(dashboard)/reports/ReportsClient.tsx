'use client'
import { useState } from 'react'

export default function ReportsClient({
  allTickets,
  members,
  clients,
  renewalAlerts,
}: {
  allTickets: any[]
  members: any[]
  clients: any[]
  renewalAlerts: any[]
}) {
  const now = new Date()

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return {
      value: d.toISOString().slice(0, 7), // "2026-07"
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    }
  })

const [selectedMonth, setSelectedMonth] = useState(() => {
  // Auto-detect the month that has the most assigned tickets
  const counts: Record<string, number> = {}
  allTickets.forEach(t => {
    if (!t.assignee_id) return
    const m = (t.assigned_date ?? t.created_at ?? '').slice(0, 7)
    if (m) counts[m] = (counts[m] ?? 0) + 1
  })
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : monthOptions[0].value
})
 const [selectedMember, setSelectedMember] = useState('all')

  // Filter tickets by month — compare "YYYY-MM" string directly to avoid timezone issues
  const inMonth = (ticket: any) => {
  if (!ticket.assignee_id) return false
  const dateStr = ticket.assigned_date ?? ticket.created_at
  if (!dateStr) return false
  return dateStr.slice(0, 7) === selectedMonth
}

  const memberStats = members
    .filter(m => selectedMember === 'all' || m.id === selectedMember)
    .map(m => {
      const mt = allTickets.filter(t => t.assignee_id === m.id && inMonth(t))
      const assigned  = mt.length
      const completed = mt.filter(t => t.status === 'done').length
      const pending   = mt.filter(t => t.status !== 'done' && t.status !== 'blocked').length
      const escalated = mt.filter(t => t.status === 'blocked').length
      const pct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0
      return { member: m, assigned, completed, pending, escalated, pct }
    })

  const totals = memberStats.reduce((acc, s) => ({
    assigned:  acc.assigned  + s.assigned,
    completed: acc.completed + s.completed,
    pending:   acc.pending   + s.pending,
    escalated: acc.escalated + s.escalated,
  }), { assigned: 0, completed: 0, pending: 0, escalated: 0 })

  const maxAssigned = Math.max(...memberStats.map(s => s.assigned), 1)
  console.log('First ticket:', JSON.stringify(allTickets[0]))
console.log('Total tickets received:', allTickets.length)
console.log('Selected month:', selectedMonth)
console.log('July tickets:', allTickets.filter(t => t.assigned_date?.slice(0,7) === '2026-07'))
console.log('Nandani tickets:', allTickets.filter(t => t.assignee_id === '5009953f-b710-4f3b-a970-78a54304376a'))
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="text-sm border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50"
        >
          Export PDF ↗
        </button>
      </div>

      {/* Dropdowns */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
        >
          {monthOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={selectedMember}
          onChange={e => setSelectedMember(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
        >
          <option value="all">All members</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Assigned',  value: totals.assigned,  color: 'text-blue-600' },
          { label: 'Completed', value: totals.completed, color: 'text-green-600' },
          { label: 'Pending',   value: totals.pending,   color: 'text-amber-600' },
          { label: 'Escalated', value: totals.escalated, color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`text-3xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-sm text-gray-500 mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Per-member breakdown */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">By member</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {memberStats.every(s => s.assigned === 0) && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No tickets assigned in {monthOptions.find(o => o.value === selectedMonth)?.label}
            </div>
          )}
          {memberStats.map(({ member, assigned, completed, pending, pct }) => (
            <div key={member.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                {member.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 mb-1.5">
                  {member.name}
                  <span className="text-xs text-gray-400 font-normal ml-2 capitalize">
                    {member.role?.replace(/_/g, ' ')}
                  </span>
                </p>
                {[
                  { label: 'Assigned',  value: assigned,  color: 'bg-blue-500' },
                  { label: 'Completed', value: completed, color: 'bg-green-500' },
                  { label: 'Pending',   value: pending,   color: 'bg-amber-400' },
                ].map(bar => (
                  <div key={bar.label} className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 w-16 text-right shrink-0">{bar.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bar.color}`}
                        style={{ width: `${Math.round((bar.value / maxAssigned) * 100)}%`, transition: 'width .4s ease' }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-5 shrink-0">{bar.value}</span>
                  </div>
                ))}
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-lg font-bold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                  {pct}%
                </div>
                <div className="text-xs text-gray-400">completion</div>
              </div>
            </div>
          ))}
        </div>
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
                <span className="text-sm text-gray-500">
                  Expires {c.contract_end ? new Date(c.contract_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </span>
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
          {clients.map((c: any) => (
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
