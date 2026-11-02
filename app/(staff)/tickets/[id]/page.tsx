import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assigneeOptionsFor, getStaffLookups, getTicketAttachments, nameMap, resolveTicketId, TASK_LIST_SELECT, ticketPageTitle } from '@/lib/queries'
import { TICKET_CATEGORY_BY_VALUE, TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { CommentThread } from '@/components/tasks/CommentThread'
import { TaskTable } from '@/components/tasks/TaskTable'
import { Card, CardHeader } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { TicketAttachmentsList } from '@/components/shared/TicketAttachmentsList'
import { CONVERSATION_CONTENT_CLASS, CONVERSATION_PANEL_CLASS } from '@/lib/conversation-layout'
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
  const me = await requireRole(['super_admin', 'admin', 'team_lead'])
  const supabase = createClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()

  const { data } = await supabase.from('tickets')
    .select('*, client:clients(id, company_name, contact_name, owner_id), ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))')
    .eq('id', ticketId)
    .maybeSingle()
  if (!data) notFound()

  const [{ data: comments }, { data: activity }, lookups, attachments, { data: linkedTasks }] = await Promise.all([
    supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getStaffLookups(),
    getTicketAttachments(ticketId),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('ticket_id', ticketId).order('created_at', { ascending: false }),
  ])
  const ticket = data as Ticket & {
    client: { id: string; company_name: string; contact_name: string | null; owner_id: string | null } | null
    ecommerce_account: { account_name: string; platform: { name: string } | null } | null
  }
  const names = nameMap(lookups.people)
  const tasksFromTicket = (linkedTasks ?? []) as TaskListItem[]
  const clientOwner = ticket.client?.owner_id
    ? lookups.people.find(person => person.id === ticket.client?.owner_id && person.role === 'client' && person.status === 'active')
    : undefined
  const clientAssignee = clientOwner && ticket.client
    ? {
        id: clientOwner.id,
      name: ticket.client.company_name,
        role: 'Client',
        avatarRole: 'client' as const,
      subtitle: ticket.client.contact_name?.trim() || 'Ticket client',
      }
    : undefined
  const def = TICKET_CATEGORY_BY_VALUE[ticket.category]
  const ticketDetails = (ticket.details ?? {}) as Record<string, string>
  const detailFields = def.fields.filter(f => ticketDetails[f.key] != null && ticketDetails[f.key] !== '')
  const raisedByProfile = ticket.created_by
    ? lookups.people.find(person => person.id === ticket.created_by)
    : undefined
  const createdByName = ticket.created_by ? names[ticket.created_by] ?? '—' : '—'
  const raisedByName = raisedByProfile?.role === 'client'
    ? ticket.client?.contact_name?.trim() || createdByName
    : createdByName
  const assignees = assigneeOptionsFor(me, lookups)
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tickets</Link>
        <div className="flex items-center gap-2">
          {['super_admin', 'admin'].includes(me.role) && <DeleteButton table="tickets" id={ticket.id} redirectTo="/tickets" label="Delete ticket" variant="danger" />}
        </div>
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

            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-slate-500">Request details</p>
              {detailFields.length > 0 ? (
                <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-slate-100 text-sm sm:grid-cols-2">
                  {detailFields.map(f => {
                    const raw = ticketDetails[f.key]
                    const value = f.type === 'select' ? f.options?.find(o => o.value === raw)?.label ?? raw
                                : f.type === 'platform' ? lookups.platforms.find(p => p.id === raw)?.name ?? raw
                                : raw
                    return (
                      <div key={f.key} className="bg-white px-3 py-2">
                        <dt className="text-xs text-slate-500">{f.label}</dt>
                        <dd className="break-words whitespace-pre-wrap font-medium text-slate-900">
                          {f.type === 'password' ? <RevealableValue value={value} /> : value}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              ) : (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">No additional request details were provided.</p>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title={`Tasks from this ticket (${tasksFromTicket.length})`} />
            {tasksFromTicket.length > 0 ? (
              <TaskTable tasks={tasksFromTicket} names={names} empty={{ title: 'No tasks yet' }} />
            ) : (
              <p className="px-5 py-4 text-sm text-slate-500">No tasks have been created from this ticket yet.</p>
            )}
          </Card>

          <Card id="conversation" className={CONVERSATION_PANEL_CLASS}>
            <CardHeader title={`Discussion (${(comments ?? []).length})`}
                        description={['super_admin', 'admin'].includes(me.role) ? 'Choose "Team only" or "Public" for each comment. Client messages are always public.' : 'Your comments are visible to the team only.'} />
            <div className={CONVERSATION_CONTENT_CLASS}>
              <CommentThread taskId={ticket.id} comments={(comments ?? []) as TicketComment[]} names={names}
                             roles={Object.fromEntries(lookups.people.map(p => [p.id, p.role]))} meId={me.id} myRole={me.role}
                             table="ticket_comments" idField="ticket_id" bounded
                             lockedNote={ticket.status === 'closed'
                               ? 'This ticket is closed. Messages can no longer be sent.'
                               : undefined} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="p-5"><ActivityTimeline activity={(activity ?? []) as TicketActivity[]} names={names} kind="ticket" /></div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <TicketProperties
              ticket={ticket}
              departments={lookups.departments}
              assignees={assignees}
              canMarkUrgent={me.role !== 'team_lead'}
              canEdit={me.role !== 'team_lead'}
              clientAssignee={clientAssignee}
              canAssignToClient={tasksFromTicket.some(task =>
                task.assignee_id === me.id && !['completed', 'cancelled'].includes(task.status)
              )}
            />
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Client', ticket.client
                  ? <Link href={`/clients/${ticket.client.id}`} className="font-medium text-brand-700 hover:underline">{ticket.client.company_name}</Link>
                  : '—'],
                ['Account', ticket.ecommerce_account ? `${ticket.ecommerce_account.platform?.name ?? ''} · ${ticket.ecommerce_account.account_name}` : '—'],
                ['Raised by', raisedByName],
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
