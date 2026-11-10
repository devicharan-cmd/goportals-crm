import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assigneeOptionsFor, clientIdsForTeamLead, departmentIdsFor, getClientProfileImageUrls, getStaffLookups, nameMap, resolveTaskId, TASK_LIST_SELECT, taskPageTitle } from '@/lib/queries'
import { TaskCode } from '@/components/tasks/TaskCode'
import { Card, CardHeader, CompanyAvatar } from '@/components/ui/primitives'
import { Badge, PriorityBadge, StatusBadge, UrgentBadge, DueDate } from '@/components/ui/badges'
import { TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES, TASK_TERMINAL_STATUSES } from '@/lib/constants'
import { TaskProperties } from '@/components/tasks/TaskProperties'
import { CONVERSATION_CONTENT_CLASS, CONVERSATION_PANEL_CLASS } from '@/lib/conversation-layout'
import { CommentThread } from '@/components/tasks/CommentThread'
import { ActivityPanel } from '@/components/tasks/ActivityPanel'
import { MarketplacePlatformLabel } from '@/components/shared/Marketplace'
import { TimeLogPanel } from '@/components/tasks/TimeLogPanel'
import { ChecklistPanel } from '@/components/tasks/ChecklistPanel'
import { ClaimButton } from '@/components/tasks/ClaimButton'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { AssignButton } from '@/components/tasks/AssignButton'
import { TaskEditModal } from '@/components/tasks/TaskEditModal'
import { ROLE_LABELS, TYPE_LABELS } from '@/lib/constants'
import { formatDate, formatRelative, taskCode } from '@/lib/utils'
import type { TaskActivity, TaskChecklistItem, TaskComment, TaskListItem, TimeLog } from '@/types/database'

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  return { title: await taskPageTitle(params.id) }
}

export default async function TaskDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const me = await requireStaff()
  const supabase = await createClient()
  const taskId = await resolveTaskId(params.id)
  if (!taskId) notFound()

  const [{ data }, { data: comments }, { data: activity }, { data: logs }, { data: checklist }, lookups] = await Promise.all([
    supabase.from('tasks').select(`${TASK_LIST_SELECT}, service:services(id, name), ticket:tickets(id, ticket_number, subject)`).eq('id', taskId).maybeSingle(),
    supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at'),
    supabase.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
    supabase.from('time_logs').select('*').eq('task_id', taskId).order('logged_date', { ascending: false }),
    supabase.from('task_checklist_items').select('*').eq('task_id', taskId).order('sort_order'),
    getStaffLookups(),
  ])
  if (!data) notFound()
  const task = data as TaskListItem & {
    service: { id: string; name: string } | null
    ticket: { id: string; ticket_number: number; subject: string } | null
  }
  const clientImagePath = task.client?.company_profile_image_path
  const { data: clientImage, error: clientImageError } = clientImagePath
    ? await supabase.storage.from('client-profile-images').createSignedUrl(clientImagePath, 3600)
    : { data: null, error: null }
  if (clientImageError) throw clientImageError
  const names = nameMap(lookups.people)

  const assignees = assigneeOptionsFor(me, lookups)
  const editAssignees = [...assignees]
  if (task.assignee_id && !editAssignees.some(person => person.id === task.assignee_id)) {
    const person = lookups.people.find(candidate => candidate.id === task.assignee_id)
    editAssignees.unshift({
      id: task.assignee_id,
      name: names[task.assignee_id] ?? 'Current assignee',
      avatarUrl: person?.avatar_url ?? null,
      role: person ? ROLE_LABELS[person.role] : 'Current assignee',
      ...(person ? { avatarRole: person.role } : {}),
    })
  }
  let editClients = lookups.clients
  if (me.role === 'team_lead') {
    const deptIds = Array.from(departmentIdsFor(me.id, lookups))
    const clientIds = await clientIdsForTeamLead(me.id, deptIds)
    editClients = lookups.clients.filter(client => clientIds.has(client.id) || client.id === task.client_id)
  }
  const editClientImageUrlByPath = await getClientProfileImageUrls(editClients)
  const canClaim = task.is_urgent && !task.assignee_id && !TASK_TERMINAL_STATUSES.includes(task.status)
  const canEditChecklist = me.role !== 'employee' || task.assignee_id === me.id

  const details: [string, React.ReactNode][] = [
    ['Task ID', <span key="id" className="font-mono font-semibold text-[#045E80]">{taskCode(task.task_number)}</span>],
    ['Client', !task.client ? '—' : (
      <span className="inline-flex items-center justify-end gap-2">
        <CompanyAvatar name={task.client.company_name} src={clientImage?.signedUrl} size="xs" />
        {me.role === 'employee'
          ? <span>{task.client.company_name}</span>
          : <Link href={`/clients/${task.client.id}`} className="font-medium text-[#034C68] hover:underline">{task.client.company_name}</Link>}
      </span>
    )],
    ['Type', TYPE_LABELS[task.type]],
    ['Service', task.service?.name ?? '—'],
    ['Department', task.department?.name ?? '—'],
    ['Platform', task.platform?.name ? <MarketplacePlatformLabel name={task.platform.name} /> : '—'],
    ...(task.ticket ? [['Ticket', <Link key="ticket" href={`/tickets/${task.ticket.id}`} className="font-medium text-[#034C68] hover:underline">
        {task.ticket.subject}
      </Link>] as [string, React.ReactNode]] : []),
    ['Created', formatDate(task.created_at)],
    ['Assigned', task.assigned_at
      ? <span className="block">
          <span className="block">{formatDate(task.assigned_at)}</span>
          <span className="block text-xs text-slate-500">
            {formatRelative(task.assigned_at)}
          </span>
        </span>
      : '—'],
    ...(task.closed_at ? [['Closed', formatDate(task.closed_at)] as [string, React.ReactNode]] : []),
  ]

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/tasks" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tasks</Link>
        <div className="flex items-center gap-2">
          {me.role === 'super_admin' && <DeleteButton table="tasks" id={task.id} redirectTo="/tasks" />}
          {me.role !== 'employee' && <AssignButton taskId={task.id} currentId={task.assignee_id} options={assignees} />}
          <TaskEditModal
            task={task}
            meId={me.id}
            canMarkUrgent={me.role !== 'employee'}
            canEditAssignment={me.role !== 'employee'}
            clients={editClients}
            clientImageUrlByPath={editClientImageUrlByPath}
            assignees={editAssignees}
            departments={lookups.departments}
            platforms={lookups.platforms}
            services={lookups.services}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TaskCode number={task.task_number} />
              {task.is_urgent && !TASK_TERMINAL_STATUSES.includes(task.status) && <UrgentBadge />}
              <StatusBadge label={TASK_STATUS_LABELS[task.status]} className={TASK_STATUS_STYLES[task.status]} dotClassName={TASK_STATUS_DOT[task.status]} />
              <PriorityBadge priority={task.priority} />
              {task.source === 'client' && <Badge className="bg-[#F5FAE8] text-[#465B17] ring-[#D3E896]">Client request</Badge>}
              <DueDate date={task.due_date} status={task.status} className="ml-auto !text-red-600" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{task.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {[task.client?.company_name, task.service?.name].filter(Boolean).join(' · ')}
              {(task.client?.company_name || task.service?.name) && task.platform?.name && ' · '}
              {task.platform?.name && <MarketplacePlatformLabel name={task.platform.name} />}
              {task.platform?.name && task.department?.name && ' · '}
              {task.department?.name}
              {!task.client?.company_name && !task.service?.name && !task.platform?.name && !task.department?.name && '—'}
            </p>
            {task.description
              ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>
              : <p className="mt-3 text-sm italic text-slate-400">No description.</p>}
            {canClaim && (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 ring-1 ring-inset ring-red-200">
                <p className="text-sm font-medium text-red-800">This urgent task needs an owner.</p>
                <ClaimButton taskId={task.id} />
              </div>
            )}
          </Card>

          {((checklist ?? []).length > 0 || canEditChecklist) && (
            <Card className="overflow-hidden">
              <CardHeader title="Checklist" />
              <div className="p-5">
                <ChecklistPanel taskId={task.id} items={(checklist ?? []) as TaskChecklistItem[]} canEdit={canEditChecklist} />
              </div>
            </Card>
          )}

          <Card id="conversation" className={CONVERSATION_PANEL_CLASS}>
            <CardHeader title={`Discussion (${(comments ?? []).length})`}
                        description="Visible to the GoPortals team. Clients do not see tasks — reply on the ticket instead." />
            <div className={CONVERSATION_CONTENT_CLASS}>
              <CommentThread taskId={task.id} comments={(comments ?? []) as TaskComment[]} names={names}
                             roles={Object.fromEntries(lookups.people.map(p => [p.id, p.role]))}
                             avatarUrls={Object.fromEntries(lookups.people.map(p => [p.id, p.avatar_url]))}
                             meId={me.id} myRole={me.role} bounded />
            </div>
          </Card>

          <ActivityPanel activity={(activity ?? []) as TaskActivity[]} names={names} />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <TaskProperties
              task={task}
              assignees={editAssignees}
              assigneeName={task.assignee_id ? names[task.assignee_id] ?? null : null}
            />
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-5 py-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Time logged" />
            <div className="p-5">
              <TimeLogPanel taskId={task.id} logs={(logs ?? []) as TimeLog[]} names={names} meId={me.id} estimated={task.estimated_hours} />
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
