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
import { Card, CardHeader, CompanyAvatar } from '@/components/ui/primitives'
import { CONVERSATION_CONTENT_CLASS, CONVERSATION_PANEL_CLASS } from '@/lib/conversation-layout'
import { RevealableValue } from '@/components/shared/RevealableValue'
import { MarketplaceAccountLabel } from '@/components/shared/Marketplace'
import { TicketProperties } from '@/components/tickets/TicketProperties'
import { ActivityPanel } from '@/components/tasks/ActivityPanel'
import { formatDate, ticketCode } from '@/lib/utils'
import type { TaskListItem, Ticket, TicketActivity, TicketComment } from '@/types/database'
import { TicketOverviewCard } from '@/components/tickets/TicketOverviewCard'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: await ticketPageTitle(params.id) }
}

export default async function StaffTicketDetailPage({ params }: { params: { id: string } }) {
  const me = await requireRole(['super_admin', 'admin', 'team_lead'])
  const supabase = createClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()

  const { data, error: ticketError } = await supabase.from('tickets')
    .select('*, client:clients(id, company_name, contact_name, owner_id, company_profile_image_path), ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))')
    .eq('id', ticketId)
    .maybeSingle()
  if (ticketError) throw ticketError
  if (!data) notFound()

  const clientImagePath = data.client?.company_profile_image_path
  const { data: clientImage, error: clientImageError } = clientImagePath
    ? await supabase.storage.from('client-profile-images').createSignedUrl(clientImagePath, 3600)
    : { data: null, error: null }
  if (clientImageError) throw clientImageError

  const [{ data: comments }, { data: activity }, lookups, attachments, { data: linkedTasks }] = await Promise.all([
    supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getStaffLookups(),
    getTicketAttachments(ticketId),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('ticket_id', ticketId).order('created_at', { ascending: false }),
  ])
  const ticket = data as Ticket & {
    client: { id: string; company_name: string; contact_name: string | null; owner_id: string | null; company_profile_image_path: string | null } | null
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
          {me.role === 'super_admin' && <DeleteButton table="tickets" id={ticket.id} redirectTo="/tickets" label="Delete ticket" variant="danger" />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <TicketOverviewCard
            ticketNumber={ticketCode(ticket.ticket_number)}
            subject={ticket.subject}
            clientName={ticket.client?.company_name ?? null}
            platformName={ticket.ecommerce_account?.platform?.name ?? null}
            accountName={ticket.ecommerce_account?.account_name ?? null}
            category={TICKET_CATEGORY_LABELS[ticket.category]}
            urgent={ticket.is_urgent}
            status={ticket.status}
            priority={ticket.priority}
            requestFields={detailFields.map(field => {
              const raw = ticketDetails[field.key]
              const value = field.type === 'select' ? field.options?.find(option => option.value === raw)?.label ?? raw
                          : field.type === 'platform' ? lookups.platforms.find(platform => platform.id === raw)?.name ?? raw
                          : raw
              return {
                key: field.key,
                label: field.label,
                value: field.type === 'password' ? <RevealableValue value={value} /> : value,
              }
            })}
            emptyRequestMessage="No additional request details were provided."
            description={ticket.description}
            attachments={attachments}
          />

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

          <ActivityPanel activity={(activity ?? []) as TicketActivity[]} names={names} kind="ticket" />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <TicketProperties
              ticket={ticket}
              departments={lookups.departments}
              platforms={lookups.platforms}
              services={lookups.services}
              assignees={assignees}
              canMarkUrgent={me.role !== 'team_lead'}
              clientAssignee={clientAssignee}
              meId={me.id}
              hasLinkedTasks={tasksFromTicket.length > 0}
            />
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Client', ticket.client
                  ? <span className="inline-flex items-center justify-end gap-2">
                      <CompanyAvatar name={ticket.client.company_name} src={clientImage?.signedUrl} size="xs" />
                      <Link href={`/clients/${ticket.client.id}`} className="font-medium text-brand-700 hover:underline">{ticket.client.company_name}</Link>
                    </span>
                  : '—'],
                ['Account', ticket.ecommerce_account
                  ? <MarketplaceAccountLabel platformName={ticket.ecommerce_account.platform?.name ?? null} accountName={ticket.ecommerce_account.account_name} size="sm" />
                  : '—'],
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
