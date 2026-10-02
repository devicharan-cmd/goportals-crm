import Link from 'next/link'
import { CheckCircle2, Clock, Loader, Plus, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader, StatCard } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { TicketTable } from '@/components/shared/TicketTable'
import type { Ticket } from '@/types/database'

export const metadata = { title: 'Overview' }

export default async function PortalHome() {
  const me = await requireClient()
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, company_name').eq('owner_id', me.id).single()

  const [{ data }, { data: accounts }, { data: services }] = await Promise.all([
    supabase.from('tickets').select('*').eq('client_id', client!.id).order('updated_at', { ascending: false }).limit(200),
    supabase.from('ecommerce_accounts').select('account_name, platform:platforms(name)').eq('client_id', client!.id).eq('status', 'active'),
    supabase.from('client_services').select('status, custom_name, service:services(name)').eq('client_id', client!.id).neq('status', 'stopped'),
  ])
  const tickets = (data ?? []) as Ticket[]
  const myAccounts = (accounts ?? []) as unknown as { account_name: string; platform: { name: string } | null }[]
  const myServices = (services ?? []) as unknown as { status: string; custom_name: string | null; service: { name: string } | null }[]
  const open = tickets.filter(t => t.status !== 'closed')
  const inProgress = tickets.filter(t => (['assigned', 'in_progress'] as Ticket['status'][]).includes(t.status))
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const doneThisMonth = tickets.filter(t => t.closed_at && new Date(t.closed_at) >= monthStart)

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-lime-400/25 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-lime-300">Welcome back{me.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{client?.company_name}</h1>
            <p className="mt-1 text-sm text-brand-100">Track every ticket your GoPortals team is working on.</p>
          </div>
          <ButtonLink href="/portal/tickets/new" variant="lime" size="lg"><Plus className="h-4 w-4" /> New ticket</ButtonLink>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open tickets" value={open.length} icon={Clock} href="/portal/tickets" />
        <StatCard label="Being worked on" value={inProgress.length} icon={Loader} tone="amber" href="/portal/tickets" />
        <StatCard label="Completed this month" value={doneThisMonth.length} icon={CheckCircle2} tone="lime" href="/portal/tickets?status=done" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader title="Recent activity" action={<Link href="/portal/tickets" className="text-xs font-semibold text-brand-600">View all</Link>} />
          <TicketTable
            tickets={tickets.slice(0, 8)}
            empty={{
              title: 'No tickets yet',
              description: 'Raise your first ticket and our team will pick it up.',
              action: <ButtonLink href="/portal/tickets/new"><Plus className="h-4 w-4" /> New ticket</ButtonLink>,
            }}
          />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Your accounts" />
            <div className="flex flex-wrap gap-1.5 p-5">
              {myAccounts.map((a, i) => <Badge key={i}>{a.platform?.name ? `${a.platform.name} · ${a.account_name}` : a.account_name}</Badge>)}
              {!accounts?.length && <span className="text-sm text-slate-400">None yet</span>}
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
