import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assigneeOptionsFor, getTicketAttachments, getTicketDetailLookups, nameMap, resolveTicketId, TASK_LIST_SELECT, type TaskAssignerInfo } from '@/lib/queries'
import { TICKET_CATEGORY_BY_VALUE, TICKET_CATEGORY_LABELS, type TicketFieldDef } from '@/lib/ticket-categories'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { TaskTable } from '@/components/tasks/TaskTable'
import { Avatar, Card, CardHeader } from '@/components/ui/primitives'
import { SignedClientAvatar } from '@/components/shared/SignedClientAvatar'
import { RevealableValue } from '@/components/shared/RevealableValue'
import { MarketplaceAccountLabel } from '@/components/shared/Marketplace'
import { TicketProperties } from '@/components/tickets/TicketProperties'
import { CloseTicketButton } from '@/components/tickets/CloseTicketButton'
import { ActivityPanel } from '@/components/tasks/ActivityPanel'
import { formatDate, formatDateTime, ticketCode } from '@/lib/utils'
import type { AppRole, TaskListItem, Ticket, TicketActivity } from '@/types/database'
import { ROLE_LABELS } from '@/lib/constants'
import { TicketOverviewCard } from '@/components/tickets/TicketOverviewCard'
import { TicketHandlingTeam, type TicketHandlingContact } from '@/components/tickets/TicketHandlingTeam'

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const ticketId = await resolveStaffTicketId(params.id)
  if (!ticketId) return { title: 'Request' }
  const { data } = await loadStaffTicket(ticketId)
  return { title: data ? ticketCode(data.ticket_number) : 'Request' }
}

const resolveStaffTicketId = cache((param: string) => resolveTicketId(param))
const loadStaffTicket = cache(async (ticketId: string) => {
  const supabase = await createClient()
  return await supabase.from('tickets')
    .select('*, client:clients(id, company_name, contact_name, owner_id, company_profile_image_path), ecommerce_account:ecommerce_accounts(account_name, platform:platforms(name))')
    .eq('id', ticketId)
    .maybeSingle()
})

export default async function StaffTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const me = await requireRole(['super_admin', 'manager', 'team_lead'])
  const supabase = await createClient()
  const ticketId = await resolveStaffTicketId(params.id)
  if (!ticketId) notFound()

  // Start ticket-independent detail queries together with the main ticket row.
  const ticketResultPromise = loadStaffTicket(ticketId)
  const relatedDataPromise = Promise.all([
    supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    getTicketDetailLookups(),
    getTicketAttachments(ticketId),
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    supabase.rpc('ticket_task_assignees', { p_ticket_id: ticketId }),
  ])
  const teamPromise: Promise<{ data: { profile_id: string }[] | null; error: { message: string } | null }> = ticketResultPromise.then(async ticketResult => {
    if (ticketResult.error) throw ticketResult.error
    const clientId = ticketResult.data?.client_id
    return clientId
      ? await supabase.from('client_team').select('profile_id').eq('client_id', clientId)
      : { data: [], error: null }
  })
  const [ticketResult, relatedData, teamResult] = await Promise.all([
    ticketResultPromise,
    relatedDataPromise,
    teamPromise,
  ])
  const { data, error: ticketError } = ticketResult
  if (ticketError) throw ticketError
  if (!data) notFound()
  const ticket = data as Ticket & {
    client: { id: string; company_name: string; contact_name: string | null; owner_id: string | null; company_profile_image_path: string | null } | null
    ecommerce_account: { account_name: string; platform: { name: string } | null } | null
  }
  const [activityResult, lookups, attachments, taskResult, workerResult] = relatedData
  if (taskResult.error) throw taskResult.error
  const tasksFromTicket = (taskResult.data ?? []) as TaskListItem[]
  const activity = activityResult.data
  const { data: workerRows, error: workersError } = workerResult
  const { data: teamRows, error: teamError } = teamResult
  if (workersError) throw new Error(`Could not load ticket workers: ${workersError.message}`)
  if (teamError) throw new Error(`Could not load the client handling team: ${teamError.message}`)
  const names = nameMap(lookups.people)
  const ticketWorkers = (workerRows ?? []) as { id: string; full_name: string | null; avatar_url: string | null; role: AppRole }[]
  const taskAssigners: Record<string, TaskAssignerInfo> = Object.fromEntries(ticketWorkers.map(worker => [worker.id, {
    name: worker.full_name || names[worker.id] || 'Staff member',
    role: worker.role,
    avatarUrl: worker.avatar_url,
  }]))
  const selectedTeamIds = new Set((teamRows ?? []).map(member => member.profile_id))
  const handlingTeam: TicketHandlingContact[] = lookups.people
    .filter(person => selectedTeamIds.has(person.id) && person.role !== 'client' && person.status === 'active')
    .map(person => ({
      id: person.id,
      full_name: person.full_name,
      avatar_url: person.avatar_url,
      role: person.role,
      email: person.email,
      phone: person.phone ?? null,
    }))
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
  const isFieldVisible = (f: TicketFieldDef) => !f.showIf || ticketDetails[f.showIf.key] === f.showIf.equals
  const categoryFields = def.fields
    .filter(f => isFieldVisible(f) && ticketDetails[f.key] != null && String(ticketDetails[f.key]).trim() !== '')
    .map(field => {
      const raw = ticketDetails[field.key]
      const value = field.type === 'select' ? field.options?.find(option => option.value === raw)?.label ?? raw
                  : field.type === 'platform' ? lookups.platforms.find(platform => platform.id === raw)?.name ?? raw
                  : raw
      return {
        key: field.key,
        label: field.label,
        value: field.type === 'password' ? <RevealableValue value={value} /> : value,
      }
    })
  const raisedByProfile = ticket.created_by
    ? ticket.created_by === me.id ? me : lookups.people.find(person => person.id === ticket.created_by)
    : undefined
  const raisedByIsClient = Boolean(ticket.created_by && ticket.created_by === ticket.client?.owner_id)
  const createdByName = ticket.created_by ? names[ticket.created_by] ?? '—' : '—'
  const raisedByName = raisedByIsClient
    ? ticket.client?.contact_name?.trim() || raisedByProfile?.full_name?.trim() || createdByName
    : raisedByProfile?.full_name?.trim() || createdByName
  const raisedByAvatar = raisedByProfile?.avatar_url
  const raisedByValue = (
    <span className="inline-flex min-w-0 items-center justify-end gap-2">
      {raisedByIsClient
        ? <SignedClientAvatar name={raisedByName} imagePath={ticket.client?.company_profile_image_path ?? null} size="xs" />
        : <Avatar name={raisedByName} src={raisedByAvatar} role={raisedByProfile?.role} size="xs" />}
      <span className="min-w-0 text-right">
        <span className="block whitespace-normal break-words font-semibold leading-5">{raisedByName}</span>
        {raisedByIsClient
          ? <span className="block text-[11px] leading-4 text-slate-500">Client</span>
          : raisedByProfile?.role && <span className="block text-[11px] leading-4 text-slate-500">{ROLE_LABELS[raisedByProfile.role]}</span>}
      </span>
    </span>
  )
  const assignees = assigneeOptionsFor(me, lookups)
  const canDelete = (me.role === 'super_admin' || me.role === 'manager') && ticket.status === 'unassigned' && tasksFromTicket.length === 0
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/tickets" prefetch={false} className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tickets</Link>
        <div className="flex items-center gap-2">
          {canDelete && <DeleteButton table="tickets" id={ticket.id} redirectTo="/tickets" label="Delete ticket" variant="danger" />}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <TicketOverviewCard
            ticketNumber={ticketCode(ticket.ticket_number)}
            subject={ticket.subject}
            category={TICKET_CATEGORY_LABELS[ticket.category]}
            urgent={ticket.is_urgent}
            status={ticket.status}
            priority={ticket.priority}
            requestFields={categoryFields}
            emptyRequestMessage="No additional request details were provided."
            description={ticket.description}
            descriptionHeading={def.descriptionLabel ?? 'Description'}
            attachments={attachments}
          />

          <Card className="overflow-hidden">
            <CardHeader title={`Tasks from this ticket (${tasksFromTicket.length})`} />
            {tasksFromTicket.length > 0 ? (
              <TaskTable tasks={tasksFromTicket} names={names} taskAssigners={taskAssigners} empty={{ title: 'No tasks yet' }} />
            ) : (
              <p className="px-5 py-4 text-sm text-slate-500">No visible tasks have been created from this ticket.</p>
            )}
          </Card>

          <ActivityPanel activity={(activity ?? []) as TicketActivity[]} names={names} kind="ticket" />
        </div>

        <div className="space-y-5">
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
              canChangeStatus={['super_admin', 'manager', 'team_lead'].includes(me.role)}
            />
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Client', ticket.client
                  ? <span className="inline-flex items-center justify-end gap-2">
                      <SignedClientAvatar name={ticket.client.company_name} imagePath={ticket.client.company_profile_image_path} size="xs" company />
                      <Link href={`/clients/${ticket.client.id}`} className="font-medium text-[#034C68] hover:underline">{ticket.client.company_name}</Link>
                    </span>
                  : '—'],
                ['Account', ticket.ecommerce_account
                  ? <MarketplaceAccountLabel platformName={ticket.ecommerce_account.platform?.name ?? null} accountName={ticket.ecommerce_account.account_name} size="sm" />
                  : '—'],
                ['Raised by', raisedByValue],
                ['Created', formatDateTime(ticket.created_at)],
                ...(ticket.status === 'closed' ? [['Closed', formatDateTime(ticket.closed_at ?? ticket.updated_at)] as [string, React.ReactNode]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3 px-5 py-2"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="min-w-0 text-right text-slate-800">{v}</dd></div>
              ))}
              {ticket.status !== 'closed' && ['super_admin', 'manager'].includes(me.role) && (
                <div className="flex items-center justify-between gap-3 px-5 py-2">
                  <dt className="text-slate-500">Action</dt>
                  <dd className="text-right">
                    <CloseTicketButton ticketId={ticket.id} ticketCode={ticketCode(ticket.ticket_number)} />
                  </dd>
                </div>
              )}
            </dl>
          </Card>
            <TicketHandlingTeam people={handlingTeam} />
        </div>
      </div>
    </>
  )
}
