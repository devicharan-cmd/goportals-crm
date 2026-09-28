import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalNames } from '@/lib/portal'
import { resolveTaskId, TASK_LIST_SELECT, taskPageTitle } from '@/lib/queries'
import { TaskCode } from '@/components/tasks/TaskCode'
import { ButtonLink } from '@/components/ui/button'
import { Avatar, Card, CardHeader } from '@/components/ui/primitives'
import { DueDate, PriorityBadge, StatusBadge } from '@/components/ui/badges'
import { CommentThread } from '@/components/tasks/CommentThread'
import { ActivityTimeline } from '@/components/tasks/ActivityTimeline'
import { STATUS_OPTIONS } from '@/lib/constants'
import { cn, formatDate } from '@/lib/utils'
import type { TaskActivity, TaskComment, TaskListItem } from '@/types/database'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: await taskPageTitle(params.id) }
}

export default async function PortalTaskDetail({ params }: { params: { id: string } }) {
  const me = await requireClient()
  const supabase = createClient()
  const taskId = await resolveTaskId(params.id)
  if (!taskId) notFound()
  const [{ data }, { data: comments }, { data: activity }, names] = await Promise.all([
    supabase.from('tasks').select(`${TASK_LIST_SELECT}, service:services(name)`).eq('id', taskId).maybeSingle(),
    supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at'),
    supabase.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
    getPortalNames(me),
  ])
  if (!data) notFound()
  const task = data as TaskListItem & { service: { name: string } | null }
  const canEdit = task.status === 'open' && task.created_by === me.id

  // Progress bar across the non-blocked statuses
  const steps = STATUS_OPTIONS.filter(s => s.value !== 'blocked')
  const stepIndex = steps.findIndex(s => s.value === task.status)

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/portal/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> My tasks</Link>
        {canEdit
          ? <ButtonLink href={`/portal/tasks/${task.id}/edit`} variant="secondary" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</ButtonLink>
          : task.created_by === me.id && task.status !== 'done' && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Work has started — add a comment to request changes</span>
            )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TaskCode number={task.task_number} />
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              <DueDate date={task.due_date} status={task.status} className="ml-auto" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{task.title}</h1>
            {task.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>}

            {task.status === 'blocked' ? (
              <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">This task is on hold — check the comments below, we may need something from you.</p>
            ) : (
              <ol className="mt-6 grid grid-cols-4 gap-2">
                {steps.map((s, i) => (
                  <li key={s.value}>
                    <div className={cn('h-1.5 rounded-full', i <= stepIndex ? 'bg-lime-500' : 'bg-slate-200')} />
                    <p className={cn('mt-1.5 text-xs', i === stepIndex ? 'font-semibold text-slate-900' : 'text-slate-400')}>{s.label}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Conversation" description="Messages with the GoPortals team" />
            <div className="p-5">
              <CommentThread taskId={task.id} comments={(comments ?? []) as TaskComment[]} names={names} meId={me.id} myRole="client" />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex items-center justify-between gap-3 px-5 py-2.5">
                <dt className="text-slate-500">Handled by</dt>
                <dd>{task.assignee_id
                  ? <span className="flex items-center gap-2"><Avatar name={names[task.assignee_id]} size="xs" />{names[task.assignee_id] ?? 'GoPortals team'}</span>
                  : <span className="text-slate-400">Being assigned</span>}</dd>
              </div>
              {[
                ['Platform', task.platform?.name],
                ['Service', task.service?.name],
                ['Raised', formatDate(task.created_at)],
                ['Completed', task.closed_at ? formatDate(task.closed_at) : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-5 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <div className="p-5"><ActivityTimeline activity={(activity ?? []) as TaskActivity[]} names={names} /></div>
          </Card>
        </div>
      </div>
    </>
  )
}
