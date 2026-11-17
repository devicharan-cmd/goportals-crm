import { Card, CardHeader } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/utils'
import type { TaskActivity } from '@/types/database'

type AssignmentEvent = {
  id: string
  kind: 'assignment'
  createdAt: string
  actorId: string | null
  previousAssigneeId: string | null
  newAssigneeId: string | null
  note?: string
}

type CreatedEvent = {
  id: string
  kind: 'created'
  createdAt: string
  actorId: string | null
  initialAssigneeId: string | null
}

type TimelineEntry = AssignmentEvent | CreatedEvent

export function TaskReassignmentHistory({
  activity,
  names,
  taskId,
  createdAt,
  createdBy,
  currentAssigneeId,
  notes,
}: {
  activity: TaskActivity[]
  names: Record<string, string>
  taskId: string
  createdAt: string
  createdBy: string | null
  currentAssigneeId: string | null
  notes: Record<string, string>
}) {
  const changes = activity
    .filter((entry) => entry.action === 'assignee_changed')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const initialAssigneeId = changes.length > 0 ? changes[0].old_value : currentAssigneeId
  const createdActivity = activity.find((entry) => entry.action === 'created')
  const entries: TimelineEntry[] = changes.map((entry) => ({
    id: entry.id,
    kind: 'assignment',
    createdAt: entry.created_at,
    actorId: entry.actor_id,
    previousAssigneeId: entry.old_value,
    newAssigneeId: entry.new_value,
    note: notes[entry.id],
  }))

  entries.push({
    id: createdActivity?.id ?? `${taskId}-created`,
    kind: 'created',
    createdAt: createdActivity?.created_at ?? createdAt,
    actorId: createdActivity ? createdActivity.actor_id : createdBy,
    initialAssigneeId,
  })

  entries.sort((a, b) => {
    const timeOrder = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (timeOrder !== 0) return timeOrder
    if (a.kind === b.kind) return 0
    return a.kind === 'created' ? 1 : -1
  })

  return (
    <Card>
      <CardHeader title="Task activity" description="Complete history of task updates and ownership changes." />
      <ol className="ml-5 space-y-5 border-l border-slate-200 py-1 pl-6 pr-5">
        {entries.map((entry, index) => {
          const actor = entry.actorId ? names[entry.actorId] ?? 'Former staff member' : 'System'
          const isLatest = index === 0
          const title = entry.kind === 'created'
            ? entry.initialAssigneeId
              ? `Task created and assigned to ${names[entry.initialAssigneeId] ?? 'a team member'}`
              : 'Task created'
            : entry.newAssigneeId
              ? entry.previousAssigneeId
                ? `Task reassigned to ${names[entry.newAssigneeId] ?? 'a team member'}`
                : `Task assigned to ${names[entry.newAssigneeId] ?? 'a team member'}`
              : 'Task unassigned'

          return (
            <li key={entry.id} className="relative min-w-0">
              <span className="absolute -left-[35px] top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs font-medium text-slate-500">
                {index + 1}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                {isLatest && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Latest</span>}
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
              {entry.kind === 'created' ? (
                <p className="text-xs text-slate-500">Created by {actor}</p>
              ) : (
                <>
                  <p className="text-xs text-slate-500">
                    {entry.previousAssigneeId ? 'Reassigned' : entry.newAssigneeId ? 'Assigned' : 'Unassigned'} by {actor}
                  </p>
                  {(entry.previousAssigneeId || entry.newAssigneeId) && (
                    <p className="text-xs text-slate-500">
                      Previous: {entry.previousAssigneeId ? names[entry.previousAssigneeId] ?? 'Former staff member' : 'Unassigned'}
                      {' → '}
                      New: {entry.newAssigneeId ? names[entry.newAssigneeId] ?? 'Former staff member' : 'Unassigned'}
                    </p>
                  )}
                  {entry.note && <p className="text-xs text-slate-500">Note: {entry.note}</p>}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
