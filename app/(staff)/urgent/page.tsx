import Link from 'next/link'
import { Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { TASK_LIST_SELECT } from '@/lib/queries'
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { Avatar, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { DueDate, PriorityBadge, StatusBadge } from '@/components/ui/badges'
import { ClaimButton } from '@/components/tasks/ClaimButton'
import { ClaimTicketButton } from '@/components/tickets/ClaimTicketButton'
import { TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES, TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_STYLES } from '@/lib/constants'
import { formatRelative, taskCode, ticketCode } from '@/lib/utils'
import type { TaskListItem, Ticket } from '@/types/database'

export const metadata = { title: 'Urgent pool' }

export default async function UrgentPage() {
  await requireStaff()
  const supabase = createClient()
  const [{ data: taskData }, { data: ticketData }, { data: people }] = await Promise.all([
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('is_urgent', true).not('status', 'in', '(completed,cancelled)')
      .order('priority').order('created_at'),
    supabase.from('tickets').select('*, client:clients(id, company_name)').eq('is_urgent', true).neq('status', 'closed')
      .order('created_at'),
    supabase.rpc('staff_directory'),
  ])
  const tasks = (taskData ?? []) as TaskListItem[]
  const tickets = (ticketData ?? []) as (Ticket & { client: { id: string; company_name: string } | null })[]
  const names = Object.fromEntries((people ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]))
  const openTasks = tasks.filter(t => !t.assignee_id)
  const takenTasks = tasks.filter(t => t.assignee_id)
  const openTickets = tickets.filter(t => !t.assignee_id)
  const takenTickets = tickets.filter(t => t.assignee_id)

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Flame className="h-6 w-6 text-red-600" /> Urgent pool</span>}
        description="Urgent work anyone on the team can pick up. First to pick it up gets it."
      />

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={`Tickets waiting for someone (${openTickets.length})`} />
        {openTickets.length === 0 ? (
          <EmptyState icon={Flame} title="All clear" description="No urgent tickets are waiting right now." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {openTickets.map(t => (
              <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <Link href={`/tickets/${t.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-400">{ticketCode(t.ticket_number)}</span>
                    {t.priority && <PriorityBadge priority={t.priority} />}
                    <p className="truncate font-semibold text-slate-900 hover:text-brand-700">{t.subject}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[t.client?.company_name, TICKET_CATEGORY_LABELS[t.category]].filter(Boolean).join(' · ')} · raised {formatRelative(t.created_at)}
                  </p>
                </Link>
                <ClaimTicketButton ticketId={t.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {takenTickets.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <CardHeader title={`Tickets being handled (${takenTickets.length})`} />
          <ul className="divide-y divide-slate-100">
            {takenTickets.map(t => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Avatar name={names[t.assignee_id!]} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs text-slate-400">{ticketCode(t.ticket_number)}</span>{t.subject}</p>
                    <p className="text-xs text-slate-500">{names[t.assignee_id!] ?? '—'} · {t.client?.company_name}</p>
                  </div>
                  <StatusBadge label={TICKET_STATUS_LABELS[t.status]} className={TICKET_STATUS_STYLES[t.status]} dotClassName={TICKET_STATUS_DOT[t.status]} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={`Tasks waiting for someone (${openTasks.length})`} />
        {openTasks.length === 0 ? (
          <EmptyState icon={Flame} title="All clear" description="No urgent tasks are waiting right now." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {openTasks.map(t => (
              <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-400">{taskCode(t.task_number)}</span>
                    <PriorityBadge priority={t.priority} />
                    <p className="truncate font-semibold text-slate-900 hover:text-brand-700">{t.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[t.client?.company_name, t.department?.name, t.platform?.name].filter(Boolean).join(' · ')} · raised {formatRelative(t.created_at)}
                  </p>
                </Link>
                <div className="flex items-center gap-4">
                  <DueDate date={t.due_date} status={t.status} />
                  <ClaimButton taskId={t.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {takenTasks.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title={`Tasks being handled (${takenTasks.length})`} />
          <ul className="divide-y divide-slate-100">
            {takenTasks.map(t => (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Avatar name={names[t.assignee_id!]} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs text-slate-400">{taskCode(t.task_number)}</span>{t.title}</p>
                    <p className="text-xs text-slate-500">{names[t.assignee_id!] ?? '—'} · {t.client?.company_name}</p>
                  </div>
                  <StatusBadge label={TASK_STATUS_LABELS[t.status]} className={TASK_STATUS_STYLES[t.status]} dotClassName={TASK_STATUS_DOT[t.status]} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
