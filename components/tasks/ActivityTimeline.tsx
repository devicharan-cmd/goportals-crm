import { ACTIVITY_LABELS, TASK_STATUS_LABELS, TICKET_STATUS_LABELS, TICKET_STATUS_LABELS_CLIENT } from '@/lib/constants'
import { formatDate, formatIndiaDateTime, formatRelative } from '@/lib/utils'
import type { ActivityEntry } from '@/types/database'

function describe(a: ActivityEntry, names: Record<string, string>, kind: 'task' | 'ticket', audience: 'staff' | 'client'): string {
  const label = ACTIVITY_LABELS[a.action] ?? a.action.replace(/_/g, ' ')
  const statusLabels: Record<string, string> = kind === 'task'
    ? TASK_STATUS_LABELS
    : audience === 'client' ? TICKET_STATUS_LABELS_CLIENT : TICKET_STATUS_LABELS
  switch (a.action) {
    case 'created':
      return 'created it'
    case 'status_changed':
      if (a.old_value === 'waiting' && a.new_value === 'todo') return 'is now visible in Todo after the previous assignee completed the task'
      return `moved it to ${statusLabels[a.new_value ?? ''] ?? a.new_value}`
    case 'assignee_changed':
      return a.new_value ? `assigned it to ${names[a.new_value] ?? 'a team member'}` : 'unassigned it'
    case 'due_date_changed':
      return a.new_value ? `set the due date to ${formatDate(a.new_value)}` : 'removed the due date'
    case 'priority_changed':
      return `changed priority ${a.old_value} → ${a.new_value}`
    case 'urgent_changed':
      return a.new_value === 'true' ? 'marked it urgent' : 'cleared the urgent flag'
    case 'internal_change_requested': {
      try {
        const metadata = a.new_value ? JSON.parse(a.new_value) as { previous_assignee_id?: string } : null
        return `requested changes from ${metadata?.previous_assignee_id ? names[metadata.previous_assignee_id] ?? 'the previous assignee' : 'the previous assignee'}`
      } catch {
        return 'requested changes from the previous assignee'
      }
    }
    case 'task_deleted': {
      const metadata = a.metadata
      const taskNumber = typeof metadata?.task_number === 'number' || typeof metadata?.task_number === 'string'
        ? `GP-${metadata.task_number}`
        : a.old_value ?? 'the linked task'
      const title = typeof metadata?.title === 'string' && metadata.title.trim() ? ` “${metadata.title}”` : ''
      const assignee = typeof metadata?.assignee_id === 'string'
        ? names[metadata.assignee_id] ?? 'a team member'
        : 'Unassigned'
      const assignedBy = typeof metadata?.assigned_by === 'string'
        ? names[metadata.assigned_by] ?? 'a team member'
        : null
      const history = Array.isArray(metadata?.assignment_history) ? metadata.assignment_history : []
      const assignmentTrail = history
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map(entry => {
          const nextAssignee = typeof entry.new_value === 'string' && entry.new_value
            ? names[entry.new_value] ?? 'a team member'
            : 'Unassigned'
          const changedBy = typeof entry.actor_id === 'string'
            ? names[entry.actor_id] ?? 'a team member'
            : 'System'
          return `${nextAssignee} by ${changedBy}`
        })
      const reassignment = assignmentTrail.length > 0
        ? `; assignment history: ${assignmentTrail.join(' → ')}`
        : ''
      return `deleted linked task ${taskNumber}${title} (assigned to ${assignee}${assignedBy ? ` by ${assignedBy}` : ''}${reassignment})`
    }
    default:
      return label
  }
}

export function ActivityTimeline({ activity, names, kind = 'task', audience = 'staff' }: { activity: ActivityEntry[]; names: Record<string, string>; kind?: 'task' | 'ticket'; audience?: 'staff' | 'client' }) {
  if (activity.length === 0) return <p className="text-sm text-slate-400">No activity yet.</p>
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {activity.map(a => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#2A87AA] ring-1 ring-[#9FCCDE]" />
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{a.actor_id ? names[a.actor_id] ?? 'Someone' : 'System'}</span>{' '}
            {describe(a, names, kind, audience)}
          </p>
          <p className="text-xs text-slate-400">
            <span>{formatIndiaDateTime(a.created_at)}</span>{' · '}{formatRelative(a.created_at)}
          </p>
        </li>
      ))}
    </ol>
  )
}
