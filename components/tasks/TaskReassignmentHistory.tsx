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
  workflowAssignees,
  workflowActivity,
}: {
  activity: TaskActivity[]
  names: Record<string, string>
  roles: Record<string, string>
  taskId: string
  createdAt: string
  createdBy: string | null
  currentAssigneeId: string | null
  notes: Record<string, string>
  workflowAssignees?: { sequence: number; name: string; role?: string; status?: string }[]
  workflowActivity?: TaskActivity[]
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
  const changeRequests = (workflowActivity ?? activity)
    .filter(entry => entry.action === 'internal_change_requested')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

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
    <Card className="flex h-auto max-h-[26rem] flex-col">
      <CardHeader title="Task activity" description="Creation and assignment updates." />
      <div className="max-h-[20rem] overflow-y-auto p-5">
      <ol className="ml-5 space-y-5 border-l border-slate-200 py-1 pl-6 pr-1">
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
                  {workflowAssignees && workflowAssignees.length > 1
                    ? <p className="min-w-0 text-xs leading-4 text-slate-600">
                        <span className="mr-1 text-slate-500">Assigned to</span>
                        {workflowAssignees.map((assignee, index) => (
                          <span key={assignee.sequence}>
                            {index > 0 && ', '}
                            <span className="font-medium text-slate-800">{assignee.name}</span>
                            {assignee.role && <span className="text-[11px] text-slate-500"> ({assignee.role})</span>}
                          </span>
                        ))}
                      </p>
                    : entry.initialAssigneeId && (
                        <Person
                          name={names[entry.initialAssigneeId] ?? 'Former staff member'}
                          role={ROLE_LABELS[roles[entry.initialAssigneeId] as keyof typeof ROLE_LABELS]}
                          prefix="Assigned to"
                        />
                      )}
                  {workflowAssignees && workflowAssignees.length > 1 && (
                    <div className="mt-2 rounded-md border-l-2 border-[#0A6F94] bg-[#EAF4F8] px-2.5 py-2">
                      <p className="text-xs font-semibold text-[#034C68]">Assignee sequence</p>
                      <ol className="mt-1 space-y-0.5">
                        {workflowAssignees.map(assignee => (
                          <li key={assignee.sequence} className="text-xs text-slate-600">
                            <span className="mr-1 font-semibold text-[#034C68]">{assignee.sequence}.</span>
                            {assignee.name}
                            {assignee.role && <span className="text-[11px] text-slate-500"> ({assignee.role})</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
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
        {changeRequests.map(entry => {
          let previousAssigneeId: string | null = null
          try {
            const metadata = entry.new_value ? JSON.parse(entry.new_value) as { previous_assignee_id?: string } : null
            previousAssigneeId = metadata?.previous_assignee_id ?? null
          } catch {
            previousAssigneeId = null
          }
          return (
            <li key={entry.id} className="relative min-w-0">
              <span aria-hidden="true" className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500 ring-1 ring-amber-200" />
              <h3 className="min-w-0 break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">Changes requested</h3>
              <p className="mt-1 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{formatDateTime(entry.created_at)}</p>
              <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                <p>Requested by <span className="font-medium text-slate-800">{entry.actor_id ? names[entry.actor_id] ?? 'Team member' : 'System'}</span></p>
                <p>Sent to <span className="font-medium text-slate-800">{previousAssigneeId ? names[previousAssigneeId] ?? 'Previous assignee' : 'Previous assignee'}</span></p>
              </div>
            </li>
          )
        })}
      </ol>
      </div>
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
