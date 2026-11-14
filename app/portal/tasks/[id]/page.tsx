import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalNames } from '@/lib/portal'
import { Card, CardHeader, StaffIdentity } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, DueDatePill } from '@/components/ui/badges'
import { CommentThread } from '@/components/tasks/CommentThread'
import { CONVERSATION_CONTENT_CLASS, CONVERSATION_PANEL_CLASS } from '@/lib/conversation-layout'
import { ClientTaskActions } from '@/components/portal/ClientTaskActions'
import { ActivityPanel } from '@/components/tasks/ActivityPanel'
import { TaskCode } from '@/components/tasks/TaskCode'
import { MarketplacePlatformLabel } from '@/components/shared/Marketplace'
import { TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES } from '@/lib/constants'
import { parseTaskCode, ticketCode } from '@/lib/utils'
import type { AppRole, TaskActivity, TaskComment, TaskSummary } from '@/types/database'

type PortalTask = TaskSummary & {
  description: string | null
  created_at: string
  service: { name: string } | null
  department: { name: string } | null
  ticket_id: string | null
  ticket: { id: string; ticket_number: number; subject: string } | null
}

type PortalStaff = { id: string; full_name: string | null; avatar_url: string | null; role: AppRole }

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  return { title: `Task ${params.id}` }
}

export default async function PortalTaskDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const me = await requireClient()
  const supabase = await createClient()
  const taskNumber = parseTaskCode(decodeURIComponent(params.id))
  const taskId = /^[0-9a-f-]{36}$/i.test(params.id) ? params.id : null
  if (!taskId && !taskNumber) notFound()

  const { data, error: taskError } = await supabase.rpc('client_ticket_tasks', {
    p_task_id: taskId,
    p_task_number: taskNumber,
  }).maybeSingle()
  if (taskError) throw new Error(taskError.message)
  if (!data) notFound()
  const task = data as PortalTask
  const resolvedTaskId = task.id

  const [{ data: comments, error: commentsError }, { data: activity, error: activityError }, names, { data: staffDirectory }, { data: taskAttachments, error: attachmentsError }] = await Promise.all([
    supabase.from('task_comments').select('*').eq('task_id', resolvedTaskId).order('created_at'),
    supabase.from('task_activity').select('*').eq('task_id', resolvedTaskId).order('created_at', { ascending: false }),
    getPortalNames(me),
    supabase.rpc('staff_directory'),
    supabase.from('task_attachments')
      .select('id, comment_id, uploaded_by, storage_path, file_name, mime_type, size_bytes')
      .eq('task_id', resolvedTaskId)
      .not('comment_id', 'is', null),
  ])
  if (commentsError) throw new Error(commentsError.message)
  if (activityError) throw new Error(activityError.message)
  if (attachmentsError) throw new Error(attachmentsError.message)
  const [signedResult, downloadResult] = taskAttachments?.length
    ? await Promise.all([
        supabase.storage.from('task-files').createSignedUrls(taskAttachments.map(file => file.storage_path), 3600),
        supabase.storage.from('task-files').createSignedUrls(taskAttachments.map(file => file.storage_path), 3600, { download: true }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  const { data: signedAttachments, error: signedAttachmentsError } = signedResult
  const { data: downloadAttachments, error: downloadAttachmentsError } = downloadResult
  if (signedAttachmentsError) throw new Error(signedAttachmentsError.message)
  if (downloadAttachmentsError) throw new Error(downloadAttachmentsError.message)
  const signedUrlByPath = new Map((signedAttachments ?? []).map(file => [file.path, file.signedUrl]))
  const downloadUrlByPath = new Map((downloadAttachments ?? []).map(file => [file.path, file.signedUrl]))
  const commentAttachments = (taskAttachments ?? []).map(file => {
    const signedUrl = signedUrlByPath.get(file.storage_path)
    const downloadUrl = downloadUrlByPath.get(file.storage_path)
    if (!signedUrl || !downloadUrl) throw new Error(`Could not create signed URLs for task attachment ${file.file_name}`)
    return { ...file, signedUrl, downloadUrl }
  })
  const commentNames = { ...names, [me.id]: me.full_name || me.email }
  const clientComments = (comments ?? []) as TaskComment[]
  const assignedToClient = task.assignee_id === me.id
  const portalStaff = (staffDirectory ?? []) as PortalStaff[]
  const assignee = portalStaff.find(person => person.id === task.assignee_id)
  const assigner = portalStaff.find(person => person.id === task.assigned_by)
  const ticketLabel = task.ticket ? `${ticketCode(task.ticket.ticket_number)} · ${task.ticket.subject}` : null

  return (
    <>
      <div className="mb-4">
        <Link href="/portal/tasks" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Tasks
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="task-overview-card p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TaskCode number={task.task_number} />
              <StatusBadge
                label={TASK_STATUS_LABELS[task.status]}
                className={`${TASK_STATUS_STYLES[task.status]}${task.status === 'changes_requested' ? ' !bg-orange-50 !text-orange-700 !ring-orange-200' : ''}`}
                dotClassName={`${TASK_STATUS_DOT[task.status]}${task.status === 'changes_requested' ? ' !bg-orange-500' : ''}`}
              />
              <PriorityBadge priority={task.priority} />
              <DueDatePill date={task.due_date} status={task.status} className="ml-auto" />
            </div>
            <div className="border-b border-[#E2E8F0] pb-4">
              <h1 className="text-xl font-bold sm:text-2xl">{task.title}</h1>
            </div>
            <section className="mt-5">
              <h2 className="mb-3 flex items-center gap-3 text-base font-semibold leading-6 text-slate-900">
                <span aria-hidden="true" className="h-5 w-1.5 shrink-0 rounded-full bg-[#0D9488]" />
                Description
              </h2>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                {task.description
                  ? <p className="whitespace-pre-wrap">{task.description}</p>
                  : <p className="italic text-slate-400">No description.</p>}
              </div>
            </section>
          </Card>

          <Card id="conversation" className={CONVERSATION_PANEL_CLASS}>
            <CardHeader
              title={`Discussion (${clientComments.length})`}
              description="Public tasks and messages are visible to you and the GoPortals team."
            />
            <div className={CONVERSATION_CONTENT_CLASS}>
              <CommentThread
                taskId={task.id}
                comments={clientComments}
                names={commentNames}
                avatarUrls={Object.fromEntries(((staffDirectory ?? []) as { id: string; avatar_url: string | null }[]).map(person => [person.id, person.avatar_url]))}
                meId={me.id}
                myRole="client"
                attachments={commentAttachments}
                bounded
              />
            </div>
          </Card>

          <ActivityPanel activity={(activity ?? []) as TaskActivity[]} names={commentNames} audience="client" />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{assignedToClient ? 'Your response' : 'Review the work'}</h2>
            <ClientTaskActions taskId={task.id} status={task.status} assignedToClient={assignedToClient} />
          </Card>
          <Card>
            <CardHeader title="Task details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {task.ticket && (
                <div className="flex justify-between gap-3 px-5 py-2.5">
                  <dt className="shrink-0 text-slate-500">Ticket</dt>
                  <dd className="min-w-0 text-right">
                    <Link href={`/portal/tickets/${task.ticket.id}`} className="font-medium text-[#034C68] hover:underline">
                      {ticketLabel}
                    </Link>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Service</dt>
                <dd className="text-right text-slate-800">{task.service?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Department</dt>
                <dd className="text-right text-slate-800">{task.department?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Platform</dt>
                <dd className="text-right text-slate-800">
                  {task.platform?.name ? <MarketplacePlatformLabel name={task.platform.name} /> : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Assignee</dt>
                <dd className="min-w-0 text-right text-slate-800">
                  {assignee ? (
                    <StaffIdentity
                      name={assignee.full_name || 'GoPortals team'}
                      src={assignee.avatar_url}
                      role={assignee.role}
                      className="justify-end text-right"
                    />
                  ) : 'GoPortals team'}
                </dd>
              </div>
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="shrink-0 text-slate-500">Assigned by</dt>
                <dd className="min-w-0 text-right text-slate-800">
                  {assigner ? (
                    <StaffIdentity
                      name={assigner.full_name || 'GoPortals team'}
                      src={assigner.avatar_url}
                      role={assigner.role}
                      className="justify-end text-right"
                    />
                  ) : '—'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
