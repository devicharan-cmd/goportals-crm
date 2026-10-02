import { addMonths, endOfMonth, format, parse, startOfMonth } from 'date-fns'
import { CheckCircle2, Clock, Inbox, TimerOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { nameMap } from '@/lib/queries'
import { Card, CardHeader, PageHeader, StatCard } from '@/components/ui/primitives'
import { PrintButton } from '@/components/shared/PrintButton'
import type { Task } from '@/types/database'

export const metadata = { title: 'Reports' }

type Row = Pick<Task, 'id' | 'client_id' | 'assignee_id' | 'status' | 'due_date' | 'created_at' | 'closed_at' | 'source'> & {
  client: { company_name: string } | null
}

export default async function ReportsPage({ searchParams }: { searchParams: { month?: string } }) {
  await requireRole(['super_admin', 'admin'])
  const supabase = createClient()

  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : format(new Date(), 'yyyy-MM')
  const start = startOfMonth(parse(month, 'yyyy-MM', new Date()))
  const end = endOfMonth(start)
  const from = start.toISOString()
  const to = end.toISOString()

  // Tasks created OR closed in the month (RLS limits managers to their scope).
  const [{ data }, { data: logs }, { data: people }] = await Promise.all([
    supabase.from('tasks')
      .select('id, client_id, assignee_id, status, due_date, created_at, closed_at, source, client:clients(company_name)')
      .or(`and(created_at.gte.${from},created_at.lte.${to}),and(closed_at.gte.${from},closed_at.lte.${to})`),
    supabase.from('time_logs').select('profile_id, hours').gte('logged_date', format(start, 'yyyy-MM-dd')).lte('logged_date', format(end, 'yyyy-MM-dd')),
    supabase.from('profiles').select('id, full_name, email'),
  ])
  const tasks = (data ?? []) as unknown as Row[]
  const names = nameMap(people ?? [])
  const inMonth = (d: string | null) => !!d && new Date(d) >= start && new Date(d) <= end

  const created = tasks.filter(t => inMonth(t.created_at))
  const closed = tasks.filter(t => inMonth(t.closed_at))
  const closedLate = closed.filter(t => t.due_date && t.closed_at!.slice(0, 10) > t.due_date)
  const totalHours = (logs ?? []).reduce((s, l: { hours: number }) => s + Number(l.hours), 0)

  const byPerson = new Map<string, { done: number; late: number; hours: number }>()
  closed.forEach(t => {
    if (!t.assignee_id) return
    const r = byPerson.get(t.assignee_id) ?? { done: 0, late: 0, hours: 0 }
    r.done++
    if (t.due_date && t.closed_at!.slice(0, 10) > t.due_date) r.late++
    byPerson.set(t.assignee_id, r)
  })
  ;(logs ?? []).forEach((l: { profile_id: string; hours: number }) => {
    const r = byPerson.get(l.profile_id) ?? { done: 0, late: 0, hours: 0 }
    r.hours += Number(l.hours)
    byPerson.set(l.profile_id, r)
  })

  const byClient = new Map<string, { name: string; created: number; done: number; fromClient: number }>()
  tasks.forEach(t => {
    const r = byClient.get(t.client_id) ?? { name: t.client?.company_name ?? '—', created: 0, done: 0, fromClient: 0 }
    if (inMonth(t.created_at)) { r.created++; if (t.source === 'client') r.fromClient++ }
    if (inMonth(t.closed_at)) r.done++
    byClient.set(t.client_id, r)
  })

  const monthOptions = Array.from({ length: 12 }, (_, i) => format(addMonths(new Date(), -i), 'yyyy-MM'))

  return (
    <>
      <PageHeader
        title="Monthly report"
        description={format(start, 'MMMM yyyy')}
        actions={
          <>
            <form className="no-print">
              <select name="month" defaultValue={month} className="input h-9 w-auto py-1.5">
                {monthOptions.map(m => <option key={m} value={m}>{format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy')}</option>)}
              </select>
              <button className="ml-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Show</button>
            </form>
            <PrintButton />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tasks created" value={created.length} icon={Inbox} />
        <StatCard label="Tasks completed" value={closed.length} icon={CheckCircle2} tone="lime" />
        <StatCard label="Completed late" value={closedLate.length} icon={TimerOff} tone={closedLate.length ? 'red' : 'lime'} />
        <StatCard label="Hours logged" value={Math.round(totalHours * 10) / 10} icon={Clock} tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="By team member" />
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2.5">Member</th><th className="px-3 py-2.5 text-right">Done</th><th className="px-3 py-2.5 text-right">Late</th><th className="px-5 py-2.5 text-right">Hours</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from(byPerson.entries()).sort((a, b) => b[1].done - a[1].done).map(([id, r]) => (
                <tr key={id}>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{names[id] ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right">{r.done}</td>
                  <td className={`px-3 py-2.5 text-right ${r.late ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{r.late}</td>
                  <td className="px-5 py-2.5 text-right">{Math.round(r.hours * 10) / 10}</td>
                </tr>
              ))}
              {byPerson.size === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">No activity this month</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="By client" />
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2.5">Client</th><th className="px-3 py-2.5 text-right">Created</th><th className="px-3 py-2.5 text-right">From client</th><th className="px-5 py-2.5 text-right">Done</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from(byClient.values()).sort((a, b) => b.created - a.created).map(r => (
                <tr key={r.name}>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2.5 text-right">{r.created}</td>
                  <td className="px-3 py-2.5 text-right">{r.fromClient}</td>
                  <td className="px-5 py-2.5 text-right">{r.done}</td>
                </tr>
              ))}
              {byClient.size === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">No activity this month</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
