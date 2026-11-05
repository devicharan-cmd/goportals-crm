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
import { ClientReplyBadge } from '@/components/portal/ClientTicketStatus'
import { CommentThread } from '@/components/tasks/CommentThread'
import { RevealableValue } from '@/components/shared/RevealableValue'
import { MarketplaceAccountLabel } from '@/components/shared/Marketplace'
import { ActivityPanel } from '@/components/tasks/ActivityPanel'
import { CONVERSATION_CONTENT_CLASS, CONVERSATION_PANEL_CLASS } from '@/lib/conversation-layout'
import { ReopenTicketButton } from '@/components/portal/ReopenTicketButton'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { formatDate, formatDateTime, splitTeamName, ticketCode } from '@/lib/utils'
import type { AppRole, TicketActivity, TicketComment, Ticket, TicketStatus } from '@/types/database'
import { TicketOverviewCard } from '@/components/tickets/TicketOverviewCard'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: await ticketPageTitle(params.id) }
}

export default async function PortalTicketDetail({ params }: { params: { id: string } }) {
  const me = await requireClient()
  const supabase = createClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()
  const [
    { data },
    { data: comments },
    { data: activity },
    names,
    attachments,
    { data: platforms },
    { data: staffDirectory },
    { data: assignmentSummary, error: assignmentSummaryError },
  ] = await Promise.all([
    supabase.from('tickets').select('*, client:clients(company_name), ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))').eq('id', ticketId).maybeSingle(),
    supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getPortalNames(me),
    getTicketAttachments(ticketId),
    supabase.from('platforms').select('id, name'),
    supabase.rpc('staff_directory'),
    supabase.rpc('client_ticket_assignment_summary', { p_ticket_id: ticketId }),
  ])
  if (!data) notFound()
  if (assignmentSummaryError) throw assignmentSummaryError
  const ticket = data as Ticket & {
    client: { company_name: string } | null
    ecommerce_account: { account_name: string; platform: { name: string } | null } | null
  }
  const summary = (assignmentSummary as { status: TicketStatus; staff_assignee_ids: string[] }[] | null)?.[0]
  if (!summary) throw new Error('Could not load ticket assignment details')
  const ticketStatus = summary.status
  const ticketComments = (comments ?? []) as TicketComment[]
  const staff = (staffDirectory ?? []) as { id: string; full_name: string | null; avatar_url: string | null; role: AppRole }[]
  const latestPublicMessage = ticketComments.slice().reverse().find(comment => !comment.is_internal)
  const replyAuthor = latestPublicMessage?.author_id
    ? staff.find(person => person.id === latestPublicMessage.author_id && ['admin', 'super_admin'].includes(person.role))
    : undefined
  // The client never reads a staff member's own name: getPortalNames() is the
  // one place that decides what they are called, so the badge and the
  // conversation say the same thing.
  const replyAuthorName = replyAuthor && latestPublicMessage?.author_id
    ? names[latestPublicMessage.author_id] ?? 'GoPortals team'
    : null
  const handledBy = summary.staff_assignee_ids.flatMap(id => {
    const person = staff.find(entry => entry.id === id)
    if (!person) return []
    const [name, role] = splitTeamName(names[id] ?? 'GoPortals team')
    return [{ id, name, role, avatarUrl: person.avatar_url, avatarRole: person.role }]
  })
  const def = TICKET_CATEGORY_BY_VALUE[ticket.category]
  const requestFields = def.fields
    .filter(field => (ticket.details as Record<string, string> | null)?.[field.key])
    .map(field => {
      const raw = String((ticket.details as Record<string, string>)[field.key])
      const value = field.type === 'select' ? field.options?.find(option => option.value === raw)?.label ?? raw
                  : field.type === 'platform' ? (platforms ?? []).find(platform => platform.id === raw)?.name ?? raw
                  : raw
      return {
        key: field.key,
        label: field.label,
        value: field.type === 'password' ? <RevealableValue value={value} /> : value,
      }
    })
  const canEdit = ticketStatus === 'unassigned' && ticket.created_by === me.id
  const workUnderWay = ticketStatus === 'assigned'

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/portal/tickets" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> My tickets</Link>
        <div className="flex items-center gap-2">
          {canEdit
            ? <ButtonLink href={`/portal/tickets/${ticket.id}/edit`} variant="secondary" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</ButtonLink>
            : ticket.created_by === me.id && workUnderWay && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Work has started — add a comment to request changes</span>
              )}
          <DeleteButton
            table="tickets"
            id={ticket.id}
            redirectTo="/portal/tickets"
            label="Delete ticket"
            description="You can delete your ticket at any status, including while it is being worked on or after it is closed. This permanently removes the ticket, its comments, attachment records, and activity history. Any linked team tasks remain but are detached from this ticket."
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <TicketOverviewCard
            ticketNumber={ticketCode(ticket.ticket_number)}
            subject={ticket.subject}
            clientName={ticket.client?.company_name ?? null}
            platformName={ticket.ecommerce_account?.platform?.name ?? null}
            accountName={ticket.ecommerce_account?.account_name ?? null}
            category={TICKET_CATEGORY_LABELS[ticket.category]}
            urgent={ticket.is_urgent}
            status={ticketStatus}
            priority={ticket.priority}
            requestFields={requestFields}
            description={ticket.description}
            attachments={attachments}
          >
            {replyAuthorName && (
              <div className="mt-4">
                <ClientReplyBadge ticketId={ticket.id} authorName={replyAuthorName} />
              </div>
            )}
            {ticketStatus === 'closed' && (
              <div className="mt-4">
                <ReopenTicketButton ticketId={ticket.id} />
              </div>
            )}
          </TicketOverviewCard>

          <Card id="conversation" className={CONVERSATION_PANEL_CLASS}>
            <CardHeader title="Conversation" description="Messages with the GoPortals team" />
            <div className={CONVERSATION_CONTENT_CLASS}>
              <CommentThread taskId={ticket.id} comments={ticketComments} names={names} meId={me.id} myRole="client"
                              table="ticket_comments" idField="ticket_id"
                              bounded
                              replyNeeded={!!replyAuthorName}
                              lockedNote={ticketStatus === 'closed'
                                ? 'This ticket is closed. Request changes above to reopen its tasks.'
                                : undefined} />
            </div>
          </Card>

          {/* Assignment is internal staffing. 068 keeps new rows off the
              client's trail; rows logged before it would read "GoPortals
              team assigned it to GoPortals team", so drop them here too. */}
          <ActivityPanel
            activity={((activity ?? []) as TicketActivity[]).filter(a => a.action !== 'assignee_changed')}
            names={names} kind="ticket" audience="client" />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex items-center justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Handled by</dt>
                <dd>
                  {handledBy.length > 0
                    ? <span className="flex flex-col items-end gap-1">
                        {handledBy.map(person => (
                          <span key={person.id} className="inline-flex items-center gap-2">
                            <Avatar name={person.name} src={person.avatarUrl} role={person.avatarRole} size="xs" />
                            <span>
                              {person.name}
                              {person.role && <span className="ml-1 text-[11px] font-normal text-slate-500">({person.role})</span>}
                            </span>
                          </span>
                        ))}
                      </span>
                    : <span className="text-slate-400">{ticketStatus === 'unassigned' ? 'Being assigned' : 'GoPortals team'}</span>}
                </dd>
              </div>
              {[
                ['Account', ticket.ecommerce_account
                  ? <MarketplaceAccountLabel platformName={ticket.ecommerce_account.platform?.name ?? null} accountName={ticket.ecommerce_account.account_name} size="sm" />
                  : null],
                ['Created', formatDateTime(ticket.created_at)],
                ['Closed', ticket.closed_at ? formatDate(ticket.closed_at) : null],
              ].filter(([, v]) => v).map(([k, v], index) => (
                <div key={index} className="flex justify-between gap-3 px-5 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
