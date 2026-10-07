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
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { CommentThread } from '@/components/tasks/CommentThread'
import { TicketAttachmentsList } from '@/components/shared/TicketAttachmentsList'
import { RevealableValue } from '@/components/shared/RevealableValue'
import { ActivityTimeline } from '@/components/tasks/ActivityTimeline'
import { CloseTicketButton } from '@/components/portal/CloseTicketButton'
import { ReopenTicketButton } from '@/components/portal/ReopenTicketButton'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_OPTIONS, TICKET_STATUS_STYLES } from '@/lib/constants'
import { cn, formatDate, ticketCode } from '@/lib/utils'
import type { TicketActivity, TicketComment, Ticket } from '@/types/database'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: await ticketPageTitle(params.id) }
}

export default async function PortalTicketDetail({ params }: { params: { id: string } }) {
  const me = await requireClient()
  const supabase = createClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()
  const [{ data }, { data: comments }, { data: activity }, names, attachments, { data: platforms }] = await Promise.all([
    supabase.from('tickets').select('*, ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))').eq('id', ticketId).maybeSingle(),
    supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getPortalNames(me),
    getTicketAttachments(ticketId),
    supabase.from('platforms').select('id, name'),
  ])
  if (!data) notFound()
  const ticket = data as Ticket & { ecommerce_account: { account_name: string; platform: { name: string } | null } | null }
  const def = TICKET_CATEGORY_BY_VALUE[ticket.category]
  const canEdit = ticket.status === 'new' && ticket.created_by === me.id
  const canClose = ticket.status === 'resolved'

  const steps = TICKET_STATUS_OPTIONS.filter(s => s.value !== 'awaiting_clarification' && s.value !== 'reopened')
  const stepIndex = steps.findIndex(s => s.value === ticket.status)

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/portal/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> My tickets</Link>
        {canEdit
          ? <ButtonLink href={`/portal/tickets/${ticket.id}/edit`} variant="secondary" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</ButtonLink>
          : ticket.created_by === me.id && ticket.status !== 'closed' && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Work has started — add a comment to request changes</span>
            )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-400">{ticketCode(ticket.ticket_number)}</span>
              {ticket.is_urgent && ticket.status !== 'closed' && <UrgentBadge />}
              <StatusBadge label={TICKET_STATUS_LABELS[ticket.status]} className={TICKET_STATUS_STYLES[ticket.status]} dotClassName={TICKET_STATUS_DOT[ticket.status]} />
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

            {ticket.status === 'awaiting_clarification' ? (
              <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">This ticket is on hold — check the comments below, we may need something from you.</p>
            ) : ticket.status === 'reopened' ? (
              <p className="mt-6 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-700">Sent back for changes — the team has been notified and is reworking it.</p>
            ) : (
              <ol className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {steps.map((s, i) => (
                  <li key={s.value}>
                    <div className={cn('h-1.5 rounded-full', i <= stepIndex ? 'bg-lime-500' : 'bg-slate-200')} />
                    <p className={cn('mt-1.5 text-xs', i === stepIndex ? 'font-semibold text-slate-900' : 'text-slate-400')}>{s.label}</p>
                  </li>
                ))}
              </ol>
            )}

            {canClose && <CloseTicketButton ticketId={ticket.id} />}
            {canClose && <ReopenTicketButton ticketId={ticket.id} />}
          </Card>

          <Card>
            <CardHeader title="Conversation" description="Messages with the GoPortals team" />
            <div className="p-5">
              <CommentThread taskId={ticket.id} comments={(comments ?? []) as TicketComment[]} names={names} meId={me.id} myRole="client"
                              table="ticket_comments" idField="ticket_id" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="p-5"><ActivityTimeline activity={(activity ?? []) as TicketActivity[]} names={names} /></div>
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
                  : <span className="text-slate-400">Being assigned</span>}</dd>
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
