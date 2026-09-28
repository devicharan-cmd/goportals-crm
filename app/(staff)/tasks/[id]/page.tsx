import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assigneeOptionsFor, getStaffLookups, nameMap, resolveTaskId, TASK_LIST_SELECT, taskPageTitle } from '@/lib/queries'
import { TaskCode } from '@/components/tasks/TaskCode'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/primitives'
import { Badge, PriorityBadge, StatusBadge, UrgentBadge, DueDate } from '@/components/ui/badges'
import { TaskProperties } from '@/components/tasks/TaskProperties'
import { CommentThread } from '@/components/tasks/CommentThread'
import { ActivityTimeline } from '@/components/tasks/ActivityTimeline'
import { TimeLogPanel } from '@/components/tasks/TimeLogPanel'
import { ClaimButton } from '@/components/tasks/ClaimButton'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { AssignButton } from '@/components/tasks/AssignButton'
import { TYPE_LABELS } from '@/lib/constants'
import { formatDate, formatRelative, taskCode } from '@/lib/utils'
import type { TaskActivity, TaskComment, TaskListItem, TimeLog } from '@/types/database'

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: await taskPageTitle(params.id) }
}

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const me = await requireStaff()
  const supabase = createClient()
  const taskId = await resolveTaskId(params.id)
  if (!taskId) notFound()

  const [{ data }, { data: comments }, { data: activity }, { data: logs }, lookups] = await Promise.all([
    supabase.from('tasks').select(`${TASK_LIST_SELECT}, service:services(id, name)`).eq('id', taskId).maybeSingle(),
    supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at'),
    supabase.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
    supabase.from('time_logs').select('*').eq('task_id', taskId).order('logged_date', { ascending: false }),
    getStaffLookups(),
  ])
  if (!data) notFound()
  const task = data as TaskListItem & { service: { id: string; name: string } | null }
  const names = nameMap(lookups.people)

  const assignees = assigneeOptionsFor(me, lookups)
  const canAssign = me.role !== 'employee' || !task.assignee_id || task.assignee_id === me.id
  const canClaim = task.is_urgent && !task.assignee_id && task.status !== 'done'

  const details: [string, React.ReactNode][] = [
    ['Task ID', <span key="id" className="font-mono font-semibold">{taskCode(task.task_number)}</span>],
    ['Client', !task.client ? '—' : me.role === 'employee' ? task.client.company_name
      : <Link href={`/clients/${task.client.id}`} className="font-medium text-brand-700 hover:underline">{task.client.company_name}</Link>],
    ['Type', TYPE_LABELS[task.type]],
    ['Service', task.service?.name ?? '—'],
    ['Department', task.department?.name ?? '—'],
    ['Platform', task.platform?.name ?? '—'],
    ['Raised by', task.created_by ? `${names[task.created_by] ?? '—'}${task.source === 'client' ? ' (client)' : ''}` : '—'],
    ['Created', formatDate(task.created_at)],
    ['Assigned', task.assigned_at ? `${formatRelative(task.assigned_at)}${task.assigned_by ? ` by ${names[task.assigned_by] ?? '—'}` : ''}` : '—'],
    ...(task.closed_at ? [['Closed', formatDate(task.closed_at)] as [string, React.ReactNode]] : []),
  ]

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Tasks</Link>
        <div className="flex items-center gap-2">
          {me.role === 'super_admin' && <DeleteButton table="tasks" id={task.id} redirectTo="/tasks" />}
          {me.role !== 'employee' && <AssignButton taskId={task.id} currentId={task.assignee_id} options={assignees} />}
          <ButtonLink href={`/tasks/${task.id}/edit`} variant="secondary" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</ButtonLink>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TaskCode number={task.task_number} />
              {task.is_urgent && task.status !== 'done' && <UrgentBadge />}
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {task.source === 'client' && <Badge className="bg-lime-50 text-lime-800 ring-lime-200">Client request</Badge>}
              <DueDate date={task.due_date} status={task.status} className="ml-auto" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{task.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {[task.client?.company_name, task.service?.name, task.platform?.name, task.department?.name].filter(Boolean).join(' · ') || '—'}
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

          <Card>
            <CardHeader title={`Discussion (${(comments ?? []).length})`}
                        description={me.role === 'employee' ? 'Your comments are visible to the team only.' : 'Choose “Team only” or “Public” for each comment. Client messages are always public.'} />
            <div className="p-5">
              <CommentThread taskId={task.id} comments={(comments ?? []) as TaskComment[]} names={names}
                             roles={Object.fromEntries(lookups.people.map(p => [p.id, p.role]))} meId={me.id} myRole={me.role} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="p-5"><ActivityTimeline activity={(activity ?? []) as TaskActivity[]} names={names} /></div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <TaskProperties
              task={task}
              assignees={assignees}
              assigneeName={task.assignee_id ? names[task.assignee_id] ?? null : null}
              canMarkUrgent={me.role !== 'employee'}
              canAssign={canAssign}
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
