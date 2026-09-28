import Link from 'next/link'
import { CheckCircle2, Clock, Loader, Plus, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalNames } from '@/lib/portal'
import { TASK_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader, StatCard } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { TaskTable } from '@/components/tasks/TaskTable'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'Overview' }

export default async function PortalHome() {
  const me = await requireClient()
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, company_name').eq('owner_id', me.id).single()

  const [{ data }, { data: platforms }, { data: services }, names] = await Promise.all([
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('client_id', client!.id).order('updated_at', { ascending: false }).limit(200),
    supabase.from('client_platforms').select('platform:platforms(name)').eq('client_id', client!.id),
    supabase.from('client_services').select('status, custom_name, service:services(name)').eq('client_id', client!.id).neq('status', 'stopped'),
    getPortalNames(me),
  ])
  const tasks = (data ?? []) as TaskListItem[]
  const myPlatforms = (platforms ?? []) as unknown as { platform: { name: string } | null }[]
  const myServices = (services ?? []) as unknown as { status: string; custom_name: string | null; service: { name: string } | null }[]
  const open = tasks.filter(t => t.status !== 'done')
  const inProgress = tasks.filter(t => ['in_progress', 'in_review'].includes(t.status))
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const doneThisMonth = tasks.filter(t => t.closed_at && new Date(t.closed_at) >= monthStart)

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-lime-400/25 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-lime-300">Welcome back{me.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{client?.company_name}</h1>
            <p className="mt-1 text-sm text-brand-100">Track every request your GoPortals team is working on.</p>
          </div>
          <ButtonLink href="/portal/tasks/new" variant="lime" size="lg"><Plus className="h-4 w-4" /> New request</ButtonLink>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open requests" value={open.length} icon={Clock} href="/portal/tasks" />
        <StatCard label="Being worked on" value={inProgress.length} icon={Loader} tone="amber" href="/portal/tasks" />
        <StatCard label="Completed this month" value={doneThisMonth.length} icon={CheckCircle2} tone="lime" href="/portal/tasks?status=done" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader title="Recent activity" action={<Link href="/portal/tasks" className="text-xs font-semibold text-brand-600">View all</Link>} />
          <TaskTable
            tasks={tasks.slice(0, 8)}
            names={names}
            hrefBase="/portal/tasks"
            showClient={false}
            empty={{
              title: 'No requests yet',
              description: 'Raise your first request and our team will pick it up.',
              action: <ButtonLink href="/portal/tasks/new"><Plus className="h-4 w-4" /> New request</ButtonLink>,
            }}
          />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Your platforms" />
            <div className="flex flex-wrap gap-1.5 p-5">
              {myPlatforms.map((p, i) => p.platform && <Badge key={i}>{p.platform.name}</Badge>)}
              {!platforms?.length && <span className="text-sm text-slate-400">None yet</span>}
            </div>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-lime-600" /> Your services</span>} />
            <ul className="divide-y divide-slate-100">
              {myServices.map((s, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-slate-700">{s.service?.name ?? s.custom_name}</span>
                  <Badge className={s.status === 'active' ? 'bg-lime-50 text-lime-700 ring-lime-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}>
                    {s.status === 'active' ? 'Active' : 'Requested'}
                  </Badge>
                </li>
              ))}
              {!services?.length && <li className="px-5 py-3 text-sm text-slate-400">None yet</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
