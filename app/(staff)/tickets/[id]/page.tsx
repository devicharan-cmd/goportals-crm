import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assigneeOptionsFor, getStaffLookups, getTicketAttachments, nameMap, resolveTicketId, TASK_LIST_SELECT, ticketPageTitle } from '@/lib/queries'
import { TICKET_CATEGORY_BY_VALUE, TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { AssignButton } from '@/components/tasks/AssignButton'
import { ClaimTicketButton } from '@/components/tickets/ClaimTicketButton'
import { CommentThread } from '@/components/tasks/CommentThread'
import { TaskTable } from '@/components/tasks/TaskTable'
import { Card, CardHeader } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { TicketAttachmentsList } from '@/components/shared/TicketAttachmentsList'
import { RevealableValue } from '@/components/shared/RevealableValue'
import { TicketProperties } from '@/components/tickets/TicketProperties'
import { ActivityTimeline } from '@/components/tasks/ActivityTimeline'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_STYLES, TICKET_TERMINAL_STATUSES } from '@/lib/constants'
import { formatDate, ticketCode } from '@/lib/utils'
import type { TaskListItem, Ticket, TicketActivity, TicketComment } from '@/types/database'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: await ticketPageTitle(params.id) }
}

export default async function StaffTicketDetailPage({ params }: { params: { id: string } }) {
  const me = await requireStaff()
  const supabase = createClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()

  const [{ data }, { data: comments }, { data: activity }, lookups, attachments, { data: linkedTasks }] = await Promise.all([
    supabase.from('tickets').select('*, client:clients(id, company_name), ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))').eq('id', ticketId).maybeSingle(),
    supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getStaffLookups(),
    getTicketAttachments(ticketId),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('ticket_id', ticketId).order('created_at', { ascending: false }),
  ])
  if (!data) notFound()
  const ticket = data as Ticket & {
    client: { id: string; company_name: string } | null
    ecommerce_account: { account_name: string; platform: { name: string } | null } | null
  }
  const names = nameMap(lookups.people)
  const tasksFromTicket = (linkedTasks ?? []) as TaskListItem[]
  const def = TICKET_CATEGORY_BY_VALUE[ticket.category]
  const assignees = assigneeOptionsFor(me, lookups)
  const canAssign = me.role !== 'employee' || !ticket.assignee_id || ticket.assignee_id === me.id
  const canClose = ['super_admin', 'admin'].includes(me.role)
  const canClaim = ticket.is_urgent && !ticket.assignee_id && !TICKET_TERMINAL_STATUSES.includes(ticket.status)

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tickets</Link>
        {me.role !== 'employee' && <AssignButton taskId={ticket.id} currentId={ticket.assignee_id} options={assignees} table="tickets" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-400">{ticketCode(ticket.ticket_number)}</span>
              {ticket.is_urgent && !TICKET_TERMINAL_STATUSES.includes(ticket.status) && <UrgentBadge />}
              <StatusBadge label={TICKET_STATUS_LABELS[ticket.status]} className={TICKET_STATUS_STYLES[ticket.status]} dotClassName={TICKET_STATUS_DOT[ticket.status]} />
              {ticket.priority && <PriorityBadge priority={ticket.priority} />}
              <span className="ml-auto text-xs text-slate-500">{TICKET_CATEGORY_LABELS[ticket.category]}</span>
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {[ticket.client?.company_name, ticket.ecommerce_account ? `${ticket.ecommerce_account.platform?.name ?? ''} · ${ticket.ecommerce_account.account_name}` : null]
                .filter(Boolean).join(' · ') || '—'}
            </p>
            {ticket.description
              ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{ticket.description}</p>
              : <p className="mt-3 text-sm italic text-slate-400">No description.</p>}
            <TicketAttachmentsList attachments={attachments} />

            {canClaim && (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 ring-1 ring-inset ring-red-200">
                <p className="text-sm font-medium text-red-800">This urgent ticket needs an owner.</p>
                <ClaimTicketButton ticketId={ticket.id} />
              </div>
            )}

            {Object.keys(ticket.details ?? {}).length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-100 text-sm sm:grid-cols-3">
                {def.fields.filter(f => (ticket.details as Record<string, string>)[f.key]).map(f => {
                  const raw = (ticket.details as Record<string, string>)[f.key]
                  const value = f.type === 'select' ? f.options?.find(o => o.value === raw)?.label ?? raw
                              : f.type === 'platform' ? lookups.platforms.find(p => p.id === raw)?.name ?? raw
                              : raw
                  return (
                    <div key={f.key} className="bg-white px-3 py-2">
                      <dt className="text-xs text-slate-500">{f.label}</dt>
                      <dd className="truncate font-medium text-slate-900">
                        {f.type === 'password' ? <RevealableValue value={value} /> : value}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            )}
          </Card>

          {tasksFromTicket.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title={`Tasks from this ticket (${tasksFromTicket.length})`} />
              <TaskTable tasks={tasksFromTicket} names={names} empty={{ title: 'No tasks yet' }} />
            </Card>
          )}

          <Card>
            <CardHeader title={`Discussion (${(comments ?? []).length})`}
                        description={me.role === 'employee' ? 'Your comments are visible to the team only.' : 'Choose "Team only" or "Public" for each comment. Client messages are always public.'} />
            <div className="p-5">
              <CommentThread taskId={ticket.id} comments={(comments ?? []) as TicketComment[]} names={names}
                             roles={Object.fromEntries(lookups.people.map(p => [p.id, p.role]))} meId={me.id} myRole={me.role}
                             table="ticket_comments" idField="ticket_id" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="p-5"><ActivityTimeline activity={(activity ?? []) as TicketActivity[]} names={names} kind="ticket" /></div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <TicketProperties ticket={ticket} departments={lookups.departments} canAssign={canAssign} canMarkUrgent={me.role !== 'employee'} canClose={canClose} />
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Client', ticket.client
                  ? <Link href={`/clients/${ticket.client.id}`} className="font-medium text-brand-700 hover:underline">{ticket.client.company_name}</Link>
                  : '—'],
                ['Account', ticket.ecommerce_account ? `${ticket.ecommerce_account.platform?.name ?? ''} · ${ticket.ecommerce_account.account_name}` : '—'],
                ['Raised by', ticket.created_by ? names[ticket.created_by] ?? '—' : '—'],
                ['Created', formatDate(ticket.created_at)],
                ...(ticket.closed_at ? [['Closed', formatDate(ticket.closed_at)] as [string, React.ReactNode]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3 px-5 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
