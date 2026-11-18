import { Card, CardHeader } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/constants'
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
  roles,
  taskId,
  createdAt,
  createdBy,
  currentAssigneeId,
  notes,
}: {
  activity: TaskActivity[]
  names: Record<string, string>
  roles: Record<string, string>
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
      <CardHeader title="Task activity" description="Creation and assignment updates." />
      <ol className="ml-5 space-y-5 border-l border-slate-200 py-1 pl-6 pr-5">
        {entries.map(entry => {
          const actor = entry.actorId ? names[entry.actorId] ?? 'Former staff member' : null
          const actorRole = entry.actorId ? ROLE_LABELS[roles[entry.actorId] as keyof typeof ROLE_LABELS] : undefined
          const title = entry.kind === 'created'
            ? 'Task created'
            : entry.newAssigneeId
              ? entry.previousAssigneeId
                ? 'Reassigned'
                : 'Assigned'
              : 'Unassigned'

          return (
            <li key={entry.id} className="relative min-w-0">
              <span aria-hidden="true" className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-600 ring-1 ring-teal-200" />
              <h3 className="min-w-0 break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</h3>
              <p className="mt-1 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{formatDateTime(entry.createdAt)}</p>
              {entry.kind === 'created' ? (
                <div className="mt-1 space-y-1">
                  {actor && <Person name={actor} role={actorRole} prefix="Created by" />}
                  {entry.initialAssigneeId && (
                    <Person
                      name={names[entry.initialAssigneeId] ?? 'Former staff member'}
                      role={ROLE_LABELS[roles[entry.initialAssigneeId] as keyof typeof ROLE_LABELS]}
                      prefix="Assigned to"
                    />
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-1 space-y-0.5">
                    {actor && <Person name={actor} role={actorRole} prefix="By" />}
                    <Person
                      name={entry.newAssigneeId ? names[entry.newAssigneeId] ?? 'Former staff member' : 'Unassigned'}
                      role={entry.newAssigneeId ? ROLE_LABELS[roles[entry.newAssigneeId] as keyof typeof ROLE_LABELS] : undefined}
                      prefix="To"
                    />
                  </div>
                  {entry.note && (
                    <p className="mt-2 whitespace-pre-wrap break-words rounded-r-md border-l-2 border-[#0A6F94] bg-[#EAF4F8] px-2.5 py-2 text-xs leading-5 text-[#034C68] [overflow-wrap:anywhere]">
                      <span className="font-semibold">Note: </span>{entry.note}
                    </p>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function Person({ name, role, prefix }: { name: string; role?: string; prefix?: string }) {
  return (
    <p className="min-w-0 text-xs leading-4 text-slate-600">
      {prefix && <span className="mr-1 text-slate-500">{prefix}</span>}
      <span className="break-words font-medium text-slate-800 [overflow-wrap:anywhere]">{name}</span>
      {role && <span className="text-[11px] text-slate-500"> ({role})</span>}
    </p>
  )
}
