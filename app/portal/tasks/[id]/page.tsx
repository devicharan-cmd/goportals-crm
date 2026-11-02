import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { resolveTaskId, TASK_LIST_SELECT } from '@/lib/queries'
import { getPortalNames } from '@/lib/portal'
import { Card, CardHeader } from '@/components/ui/primitives'
import { PriorityBadge, StatusBadge, DueDate } from '@/components/ui/badges'
import { CommentThread } from '@/components/tasks/CommentThread'
import { ClientTaskActions } from '@/components/portal/ClientTaskActions'
import { ClientTaskAttachments } from '@/components/portal/ClientTaskAttachments'
import { TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES } from '@/lib/constants'
import { formatDate, taskCode, ticketCode } from '@/lib/utils'
import type { TaskAttachment, TaskComment, TaskListItem } from '@/types/database'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Task ${params.id}` }
}

export default async function PortalTaskDetailPage({ params }: { params: { id: string } }) {
  const me = await requireClient()
  const supabase = createClient()
  const taskId = await resolveTaskId(params.id)
  if (!taskId) notFound()

  const [{ data, error: taskError }, { data: comments, error: commentsError }, { data: attachments, error: attachmentsError }, names] = await Promise.all([
    supabase.from('tasks')
      .select(`${TASK_LIST_SELECT}, ticket:tickets(id, ticket_number, subject)`)
      .eq('id', taskId)
      .maybeSingle(),
    supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at'),
    supabase.from('task_attachments').select('*').eq('task_id', taskId).order('created_at'),
    getPortalNames(me),
  ])
  if (taskError) throw new Error(taskError.message)
  if (commentsError) throw new Error(commentsError.message)
  if (attachmentsError) throw new Error(attachmentsError.message)
  if (!data || data.assignee_id !== me.id) notFound()

  const task = data as TaskListItem & {
    ticket: { id: string; ticket_number: number; subject: string } | null
  }
  const attachmentLinks = await Promise.all(((attachments ?? []) as TaskAttachment[]).map(async attachment => {
    const { data: signed, error } = await supabase.storage.from('task-files').createSignedUrl(attachment.storage_path, 3600)
    if (error) throw new Error(error.message)
    return { ...attachment, signedUrl: signed.signedUrl }
  }))
  const commentNames = { ...names, [me.id]: me.full_name || me.email }
  const clientComments = (comments ?? []) as TaskComment[]

  return (
    <>
      <div className="mb-4">
        <Link href="/portal/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> My tasks
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-400">{taskCode(task.task_number)}</span>
              <StatusBadge label={TASK_STATUS_LABELS[task.status]} className={TASK_STATUS_STYLES[task.status]} dotClassName={TASK_STATUS_DOT[task.status]} />
              <PriorityBadge priority={task.priority} />
              <DueDate date={task.due_date} status={task.status} className="ml-auto" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{task.title}</h1>
            {task.ticket && (
              <Link href={`/portal/tickets/${task.ticket.id}`} className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
                {ticketCode(task.ticket.ticket_number)} · {task.ticket.subject}
              </Link>
            )}
            {task.description
              ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>
              : <p className="mt-3 text-sm italic text-slate-400">No additional instructions.</p>}
          </Card>

          <Card>
            <CardHeader title={`Files (${attachmentLinks.length})`} description="Upload the documents or images requested by the GoPortals team." />
            <ClientTaskAttachments taskId={task.id} meId={me.id} attachments={attachmentLinks} status={task.status} />
          </Card>

          <Card id="conversation" className="overflow-hidden">
            <CardHeader title={`Discussion (${clientComments.length})`} description="Messages here are visible to you and the GoPortals team." />
            <div className="p-5">
              <CommentThread taskId={task.id} comments={clientComments} names={commentNames} meId={me.id} myRole="client" />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Your response</h2>
            <ClientTaskActions taskId={task.id} status={task.status} />
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
