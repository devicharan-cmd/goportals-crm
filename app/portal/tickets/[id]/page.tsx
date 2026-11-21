import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalNames } from '@/lib/portal'
import { addTaskAssigneeHistory, getTicketAttachments, resolveTicketId, ticketPageTitle, type TaskAssignerInfo } from '@/lib/queries'
import { TICKET_CATEGORY_BY_VALUE, TICKET_CATEGORY_LABELS, type TicketFieldDef } from '@/lib/ticket-categories'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/primitives'
import { RevealableValue } from '@/components/shared/RevealableValue'
import { MarketplaceAccountLabel } from '@/components/shared/Marketplace'
import { ActivityPanel } from '@/components/tasks/ActivityPanel'
import { ReopenTicketButton } from '@/components/portal/ReopenTicketButton'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { formatDate, formatDateTime, ticketCode } from '@/lib/utils'
import type { TicketActivity, Ticket, TicketStatus } from '@/types/database'
import { TicketOverviewCard } from '@/components/tickets/TicketOverviewCard'
import { TicketHandlingTeam, type TicketHandlingContact } from '@/components/tickets/TicketHandlingTeam'
import { TaskTable } from '@/components/tasks/TaskTable'
import { ROLE_LABELS } from '@/lib/constants'
import type { StaffDirectoryEntry, TaskSummary } from '@/types/database'

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  return { title: await ticketPageTitle(params.id) }
}

export default async function PortalTicketDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const me = await requireClient()
  const supabase = await createClient()
  const ticketId = await resolveTicketId(params.id)
  if (!ticketId) notFound()
  const [
    { data },
    { data: activity },
    names,
    attachments,
    { data: platforms },
    { data: handlingTeamRows, error: handlingTeamError },
    { data: assignmentSummary, error: assignmentSummaryError },
    { data: canDeleteTicket, error: canDeleteTicketError },
    { data: clientTasks, error: clientTasksError },
    { data: staffDirectory, error: staffDirectoryError },
  ] = await Promise.all([
    supabase.from('tickets').select('*, client:clients(company_name), ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))').eq('id', ticketId).maybeSingle(),
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getPortalNames(me),
    getTicketAttachments(ticketId),
    supabase.from('platforms').select('id, name'),
    supabase.rpc('client_ticket_handling_team', { p_ticket_id: ticketId }),
    supabase.rpc('client_ticket_assignment_summary', { p_ticket_id: ticketId }),
    supabase.rpc('client_can_delete_ticket', { p_ticket_id: ticketId }),
    supabase.rpc('client_ticket_tasks', { p_task_id: null, p_task_number: null }),
    supabase.rpc('staff_directory'),
  ])
  if (!data) notFound()
  if (assignmentSummaryError) throw assignmentSummaryError
  if (canDeleteTicketError) throw canDeleteTicketError
  if (clientTasksError) throw clientTasksError
  if (staffDirectoryError) throw staffDirectoryError
  const ticket = data as Ticket & {
    client: { company_name: string } | null
    ecommerce_account: { account_name: string; platform: { name: string } | null } | null
  }
  const summary = (assignmentSummary as { status: TicketStatus; staff_assignee_ids: string[] }[] | null)?.[0]
  if (!summary) throw new Error('Could not load ticket assignment details')
  const ticketStatus = summary.status
  const handlingTeam = (handlingTeamRows ?? []) as TicketHandlingContact[]
  const linkedClientTasks = await addTaskAssigneeHistory(
    supabase,
    ((clientTasks ?? []) as TaskSummary[]).filter(task => task.ticket_id === ticketId),
  )
  const staff = (staffDirectory ?? []) as StaffDirectoryEntry[]
  const taskAssigners: Record<string, TaskAssignerInfo> = Object.fromEntries(staff.map(person => [person.id, {
    name: names[person.id] ?? person.full_name ?? 'GoPortals team',
    role: person.role,
    avatarUrl: person.avatar_url,
  }]))
  const def = TICKET_CATEGORY_BY_VALUE[ticket.category]
  const ticketDetails = (ticket.details ?? {}) as Record<string, string>
  const isFieldVisible = (f: TicketFieldDef) => !f.showIf || ticketDetails[f.showIf.key] === f.showIf.equals

  const categoryFields = def.fields
    .filter(field => isFieldVisible(field) && ticketDetails[field.key] != null && String(ticketDetails[field.key]).trim() !== '')
    .map(field => {
      const raw = String(ticketDetails[field.key])
      const value = field.type === 'select' ? field.options?.find(option => option.value === raw)?.label ?? raw
                  : field.type === 'platform' ? (platforms ?? []).find(platform => platform.id === raw)?.name ?? raw
                  : raw
      return {
        key: field.key,
        label: field.label,
        value: field.type === 'password' ? <RevealableValue value={value} /> : value,
      }
    })

  const requestFields = categoryFields
  const canEdit = ticketStatus === 'unassigned' && ticket.created_by === me.id
  const canDelete = canDeleteTicket === true
  const workUnderWay = ticketStatus === 'assigned'

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/portal/tickets" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> My tickets</Link>
        <div className="flex items-center gap-2">
          {canEdit
            ? <ButtonLink href={`/portal/tickets/${ticket.id}/edit`} variant="secondary" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</ButtonLink>
            : ticket.created_by === me.id && workUnderWay && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Work has started</span>
              )}
          {canDelete && (
            <DeleteButton
              table="tickets"
              id={ticket.id}
              redirectTo="/portal/tickets"
              label="Delete ticket"
              description="You can delete your own ticket while no team tasks are linked. This permanently removes the ticket, its attachments, and activity history for everyone."
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <TicketOverviewCard
            ticketNumber={ticketCode(ticket.ticket_number)}
            subject={ticket.subject}
            category={TICKET_CATEGORY_LABELS[ticket.category]}
            urgent={ticket.is_urgent}
            status={ticketStatus}
            priority={ticket.priority}
            requestFields={requestFields}
            description={ticket.description}
            descriptionHeading={def.descriptionLabel ?? 'Description'}
            attachments={attachments}
          >
            {ticketStatus === 'closed' && (
              <div className="mt-4">
                <ReopenTicketButton ticketId={ticket.id} />
              </div>
            )}
          </TicketOverviewCard>

          <Card className="overflow-hidden">
            <CardHeader title={`Tasks from this ticket (${linkedClientTasks.length})`} />
            <TaskTable
              tasks={linkedClientTasks}
              names={names}
              taskAssigners={taskAssigners}
              hrefBase="/portal/tasks"
              showClient={false}
              empty={{
                title: 'No client-visible tasks yet',
                description: 'Tasks shared with you from this ticket will appear here.',
              }}
            />
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
          <TicketHandlingTeam people={handlingTeam} unavailable={Boolean(handlingTeamError)} />
        </div>
      </div>
    </>
  )
}
