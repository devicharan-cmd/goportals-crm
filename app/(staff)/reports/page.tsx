import { addMonths, endOfMonth, format, parse, startOfMonth } from 'date-fns'
import { ClipboardList, CheckCircle2, Clock, Inbox, TimerOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { nameMap } from '@/lib/queries'
import { Card, CardHeader, PageHeader, StatCard } from '@/components/ui/primitives'
import { PrintButton } from '@/components/shared/PrintButton'
import { SearchableSelect } from '@/components/shared/SearchableSelect'

export const metadata = { title: 'Reports' }

type ReportSummary = {
  tickets_raised: number
  tickets_closed: number
  hours_logged: number
  tasks_created: number
  tasks_completed: number
  tasks_completed_late: number
  by_person: { profile_id: string; done: number; late: number; hours: number }[]
  by_client: { client_id: string | null; company_name: string | null; created: number; done: number; tickets: number }[]
}

export default async function ReportsPage(props: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await props.searchParams
  await requireRole(['super_admin', 'manager'])
  const supabase = await createClient()

  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : format(new Date(), 'yyyy-MM')
  const start = startOfMonth(parse(month, 'yyyy-MM', new Date()))
  const end = endOfMonth(start)
  const [{ data: summaryData, error: summaryError }, { data: people, error: peopleError }] = await Promise.all([
    supabase.rpc('monthly_report_summary', {
      p_from: start.toISOString(),
      p_to: end.toISOString(),
      p_log_from: format(start, 'yyyy-MM-dd'),
      p_log_to: format(end, 'yyyy-MM-dd'),
    }),
    supabase.from('profiles').select('id, full_name, email'),
  ])
  if (summaryError) throw summaryError
  if (peopleError) throw peopleError
  const summary = summaryData as ReportSummary
  const names = nameMap(people ?? [])
  const byPerson = new Map(summary.by_person.map(row => [row.profile_id, {
    done: Number(row.done),
    late: Number(row.late),
    hours: Number(row.hours),
  }]))
  const byClient = summary.by_client.map(row => ({
    name: row.company_name ?? '—',
    created: Number(row.created),
    done: Number(row.done),
    tickets: Number(row.tickets),
  }))

  const monthOptions = Array.from({ length: 12 }, (_, i) => format(addMonths(new Date(), -i), 'yyyy-MM'))

  return (
    <>
      <PageHeader
        title="Monthly report"
        description={format(start, 'MMMM yyyy')}
        actions={
          <>
            <form className="no-print">
              <SearchableSelect name="month" defaultValue={month} className="form-field h-9 w-auto py-1.5" aria-label="Report month" searchPlaceholder="Search months...">
                {monthOptions.map(m => <option key={m} value={m}>{format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy')}</option>)}
              </SearchableSelect>
              <button className="ml-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Show</button>
            </form>
            <PrintButton />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Tickets raised" value={Number(summary.tickets_raised)} icon={<ClipboardList className="h-5 w-5" />} tone="brand" />
        <StatCard label="Tickets closed" value={Number(summary.tickets_closed)} icon={<CheckCircle2 className="h-5 w-5" />} tone="lime" />
        <StatCard label="Hours logged" value={Math.round(Number(summary.hours_logged) * 10) / 10} icon={<Clock className="h-5 w-5" />} tone="amber" />
        <StatCard label="Tasks created" value={Number(summary.tasks_created)} icon={<Inbox className="h-5 w-5" />} />
        <StatCard label="Tasks completed" value={Number(summary.tasks_completed)} icon={<CheckCircle2 className="h-5 w-5" />} tone="lime" />
        <StatCard label="Completed late" value={Number(summary.tasks_completed_late)} icon={<TimerOff className="h-5 w-5" />} tone={summary.tasks_completed_late ? 'red' : 'lime'} />
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
              <th className="px-5 py-2.5">Client</th><th className="px-3 py-2.5 text-right">Created</th><th className="px-3 py-2.5 text-right">Tickets</th><th className="px-5 py-2.5 text-right">Done</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {byClient.sort((a, b) => b.created - a.created).map((r, index) => (
                <tr key={`${r.name}-${index}`}>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2.5 text-right">{r.created}</td>
                  <td className="px-3 py-2.5 text-right">{r.tickets}</td>
                  <td className="px-5 py-2.5 text-right">{r.done}</td>
                </tr>
              ))}
              {byClient.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">No activity this month</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
