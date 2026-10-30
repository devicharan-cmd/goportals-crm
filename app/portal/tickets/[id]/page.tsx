import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalNames } from '@/lib/portal'
import { getTicketAttachments, resolveTicketId, ticketPageTitle } from '@/lib/queries'
import { TICKET_CATEGORY_BY_VALUE, TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { ButtonLink } from '@/components/ui/button'
import { Avatar, Card, CardHeader } from '@/components/ui/primitives'
import { PriorityBadge, UrgentBadge } from '@/components/ui/badges'
import { ClientReplyBadge, ClientTicketStatusBadge } from '@/components/portal/ClientTicketStatus'
import { CommentThread } from '@/components/tasks/CommentThread'
import { TicketAttachmentsList } from '@/components/shared/TicketAttachmentsList'
import { RevealableValue } from '@/components/shared/RevealableValue'
import { ActivityTimeline } from '@/components/tasks/ActivityTimeline'
import { MarkMessagesSeen } from '@/components/shared/MarkMessagesSeen'
import { CONVERSATION_CONTENT_CLASS, CONVERSATION_PANEL_CLASS } from '@/lib/conversation-layout'
import { CloseTicketButton } from '@/components/portal/CloseTicketButton'
import { ReopenTicketButton } from '@/components/portal/ReopenTicketButton'
import { clientPortalTicketStatus } from '@/lib/ticket-status'
import { formatDate, ticketCode } from '@/lib/utils'
import type { TicketActivity, TicketComment, Ticket } from '@/types/database'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: await ticketPageTitle(params.id) }
}

export default async function PortalTicketDetail({ params }: { params: { id: string } }) {
  const me = await requireClient()
  const supabase = createClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()
  const [{ data }, { data: comments }, { data: activity }, names, attachments, { data: platforms }, { data: staffDirectory }] = await Promise.all([
    supabase.from('tickets').select('*, ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))').eq('id', ticketId).maybeSingle(),
    supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getPortalNames(me),
    getTicketAttachments(ticketId),
    supabase.from('platforms').select('id, name'),
    supabase.rpc('staff_directory'),
  ])
  if (!data) notFound()
  const ticket = data as Ticket & { ecommerce_account: { account_name: string; platform: { name: string } | null } | null }
  const ticketComments = (comments ?? []) as TicketComment[]
  const portalStatus = clientPortalTicketStatus(ticket)
  const latestPublicMessage = ticketComments.slice().reverse().find(comment => !comment.is_internal)
  const replyAuthor = latestPublicMessage?.author_id
    ? (staffDirectory as { id: string; full_name: string | null; role: string }[] | null)?.find(person => person.id === latestPublicMessage.author_id && ['admin', 'super_admin'].includes(person.role))
    : undefined
  // The client never reads a staff member's own name: getPortalNames() is the
  // one place that decides what they are called, so the badge and the
  // conversation say the same thing.
  const replyAuthorName = replyAuthor && latestPublicMessage?.author_id
    ? names[latestPublicMessage.author_id] ?? 'GoPortals team'
    : null
  const def = TICKET_CATEGORY_BY_VALUE[ticket.category]
  const canEdit = portalStatus === 'new' && ticket.created_by === me.id
  const canClose = ['resolved', 'ready_for_client'].includes(portalStatus)
  // Only say work is under way while it actually is: the other statuses each
  // carry their own, more exact message further down the page.
  const workUnderWay = ['under_review', 'assigned', 'in_progress', 'ready_for_review', 'ready_for_client'].includes(portalStatus)

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/portal/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> My tickets</Link>
        {canEdit
          ? <ButtonLink href={`/portal/tickets/${ticket.id}/edit`} variant="secondary" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</ButtonLink>
          : ticket.created_by === me.id && workUnderWay && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Work has started — add a comment to request changes</span>
            )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-400">{ticketCode(ticket.ticket_number)}</span>
              {ticket.is_urgent && ticket.status !== 'closed' && <UrgentBadge />}
              <ClientTicketStatusBadge status={portalStatus} />
              {ticket.priority && <PriorityBadge priority={ticket.priority} />}
              <span className="ml-auto text-xs text-slate-400">{TICKET_CATEGORY_LABELS[ticket.category]}</span>
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{ticket.subject}</h1>
            {ticket.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{ticket.description}</p>}
            <TicketAttachmentsList attachments={attachments} />

            {Object.keys(ticket.details ?? {}).length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-100 text-sm sm:grid-cols-3">
                {def.fields.filter(f => (ticket.details as Record<string, string>)[f.key]).map(f => {
                  const raw = String((ticket.details as Record<string, string>)[f.key])
                  const value = f.type === 'select' ? f.options?.find(o => o.value === raw)?.label ?? raw
                              : f.type === 'platform' ? (platforms ?? []).find(p => p.id === raw)?.name ?? raw
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

            {replyAuthorName && (
              <div className="mt-4">
                <ClientReplyBadge ticketId={ticket.id} authorName={replyAuthorName} />
              </div>
            )}

            {canClose && <CloseTicketButton ticketId={ticket.id} />}
            {canClose && <ReopenTicketButton ticketId={ticket.id} />}
          </Card>

          <MarkMessagesSeen ticketId={ticket.id}
            hasUnseen={ticketComments.some(c => c.author_id !== me.id && !c.seen_at)} />
          <Card id="conversation" className={CONVERSATION_PANEL_CLASS}>
            <CardHeader title="Conversation" description="Messages with the GoPortals team" />
            <div className={CONVERSATION_CONTENT_CLASS}>
              <CommentThread taskId={ticket.id} comments={ticketComments} names={names} meId={me.id} myRole="client"
                              table="ticket_comments" idField="ticket_id"
                              showReceipts bounded
                              replyNeeded={!!replyAuthorName}
                              lockedNote={ticket.status === 'closed'
                                ? 'This ticket is closed. Raise a new ticket if you need anything else.'
                                : undefined} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            {/* Assignment is internal staffing. 068 keeps new rows off the
                client's trail; rows logged before it would read "GoPortals
                team assigned it to GoPortals team", so drop them here too. */}
            <div className="p-5"><ActivityTimeline
              activity={((activity ?? []) as TicketActivity[]).filter(a => a.action !== 'assignee_changed')}
              names={names} kind="ticket" audience="client" /></div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex items-center justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Handled by</dt>
                <dd>{ticket.assignee_id
                  ? <span className="flex items-center gap-2"><Avatar name={names[ticket.assignee_id]} size="xs" />{names[ticket.assignee_id] ?? 'GoPortals team'}</span>
                  : <span className="text-slate-400">{['resolved', 'closed'].includes(ticket.status) ? 'GoPortals team' : 'Being assigned'}</span>}</dd>
              </div>
              {[
                ['Account', ticket.ecommerce_account ? `${ticket.ecommerce_account.platform?.name ?? ''} · ${ticket.ecommerce_account.account_name}` : null],
                ['Raised', formatDate(ticket.created_at)],
                ['Completed', ticket.closed_at ? formatDate(ticket.closed_at) : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-5 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
