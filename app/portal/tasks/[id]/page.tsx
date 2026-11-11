import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalNames } from '@/lib/portal'
import { Card, CardHeader } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, DueDate } from '@/components/ui/badges'
import { CommentThread } from '@/components/tasks/CommentThread'
import { ClientTaskActions } from '@/components/portal/ClientTaskActions'
import { ClientTaskAttachments } from '@/components/portal/ClientTaskAttachments'
import { ActivityPanel } from '@/components/tasks/ActivityPanel'
import { TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES } from '@/lib/constants'
import { formatDate, parseTaskCode, taskCode, ticketCode } from '@/lib/utils'
import type { TaskActivity, TaskAttachment, TaskComment, TaskSummary } from '@/types/database'

type PortalTask = TaskSummary & {
  description: string | null
  created_at: string
  ticket_id: string | null
  ticket: { id: string; ticket_number: number; subject: string } | null
}

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

  const [{ data: comments, error: commentsError }, { data: attachments, error: attachmentsError }, { data: activity, error: activityError }, names, { data: staffDirectory }] = await Promise.all([
    supabase.from('task_comments').select('*').eq('task_id', resolvedTaskId).order('created_at'),
    supabase.from('task_attachments').select('*').eq('task_id', resolvedTaskId).order('created_at'),
    supabase.from('task_activity').select('*').eq('task_id', resolvedTaskId).order('created_at', { ascending: false }),
    getPortalNames(me),
    supabase.rpc('staff_directory'),
  ])
  if (commentsError) throw new Error(commentsError.message)
  if (attachmentsError) throw new Error(attachmentsError.message)
  if (activityError) throw new Error(activityError.message)
  const attachmentLinks = await Promise.all(((attachments ?? []) as TaskAttachment[]).map(async attachment => {
    const { data: signed, error } = await supabase.storage.from('task-files').createSignedUrl(attachment.storage_path, 3600)
    if (error) throw new Error(error.message)
    return { ...attachment, signedUrl: signed.signedUrl }
  }))
  const commentNames = { ...names, [me.id]: me.full_name || me.email }
  const clientComments = (comments ?? []) as TaskComment[]
  const assignedToClient = task.assignee_id === me.id

  return (
    <>
      <div className="mb-4">
        <Link href="/portal/tasks" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> My tasks
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#045E80]">{taskCode(task.task_number)}</span>
              <StatusBadge label={TASK_STATUS_LABELS[task.status]} className={TASK_STATUS_STYLES[task.status]} dotClassName={TASK_STATUS_DOT[task.status]} />
              <PriorityBadge priority={task.priority} />
              <DueDate date={task.due_date} status={task.status} className="ml-auto" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{task.title}</h1>
            {task.ticket && (
              <Link href={`/portal/tickets/${task.ticket.id}`} className="mt-2 inline-block text-sm font-medium text-[#034C68] hover:underline">
                <span className="font-mono font-semibold text-[#045E80]">{ticketCode(task.ticket.ticket_number)}</span> · {task.ticket.subject}
              </Link>
            )}
            {task.description
              ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>
              : <p className="mt-3 text-sm italic text-slate-400">
                  {assignedToClient ? 'No additional instructions.' : 'Additional task details are not available in the client portal.'}
                </p>}
          </Card>

          <Card>
            <CardHeader
              title={`Files (${attachmentLinks.length})`}
              description={assignedToClient ? 'Upload documents or images requested by the GoPortals team.' : 'Files shared with you for this task.'}
            />
            <ClientTaskAttachments taskId={task.id} meId={me.id} attachments={attachmentLinks} status={task.status} canUpload={assignedToClient} />
          </Card>

          <ActivityPanel activity={(activity ?? []) as TaskActivity[]} names={commentNames} audience="client" />

          <Card id="conversation" className="overflow-hidden">
            <CardHeader
              title={`Discussion (${clientComments.length})`}
              description={assignedToClient ? 'Messages here are visible to you and the GoPortals team.' : 'Public updates and your review feedback.'}
            />
            <div className="p-5">
              {assignedToClient ? (
                <CommentThread
                  taskId={task.id}
                  comments={clientComments}
                  names={commentNames}
                  avatarUrls={Object.fromEntries(((staffDirectory ?? []) as { id: string; avatar_url: string | null }[]).map(person => [person.id, person.avatar_url]))}
                  meId={me.id}
                  myRole="client"
                />
              ) : clientComments.length > 0 ? (
                <ul className="space-y-3">
                  {clientComments.map(comment => (
                    <li key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs font-medium text-slate-500">{comment.author_id ? commentNames[comment.author_id] ?? 'GoPortals team' : 'GoPortals team'}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{comment.body}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{formatDate(comment.created_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">The GoPortals team is handling this task. If it reaches Client review, you can approve it or request changes here.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{assignedToClient ? 'Your response' : 'Review the work'}</h2>
            <ClientTaskActions taskId={task.id} status={task.status} assignedToClient={assignedToClient} />
          </Card>
          <Card>
            <CardHeader title="Task details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Client</dt>
                <dd className="text-right text-slate-800">{task.client?.company_name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-right text-slate-800">{formatDate(task.created_at)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
