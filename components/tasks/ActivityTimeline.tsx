import { ACTIVITY_LABELS, STATUS_LABELS } from '@/lib/constants'
import { formatDate, formatRelative } from '@/lib/utils'
import type { TaskActivity, TaskStatus } from '@/types/database'

function describe(a: TaskActivity, names: Record<string, string>): string {
  const label = ACTIVITY_LABELS[a.action] ?? a.action.replace(/_/g, ' ')
  switch (a.action) {
    case 'status_changed':
      return `moved it to ${STATUS_LABELS[a.new_value as TaskStatus] ?? a.new_value}`
    case 'assignee_changed':
      return a.new_value ? `assigned it to ${names[a.new_value] ?? 'a team member'}` : 'unassigned it'
    case 'due_date_changed':
      return a.new_value ? `set the due date to ${formatDate(a.new_value)}` : 'removed the due date'
    case 'priority_changed':
      return `changed priority ${a.old_value} → ${a.new_value}`
    case 'urgent_changed':
      return a.new_value === 'true' ? 'marked it urgent' : 'cleared the urgent flag'
    default:
      return label
  }
}

export function ActivityTimeline({ activity, names }: { activity: TaskActivity[]; names: Record<string, string> }) {
  if (activity.length === 0) return <p className="text-sm text-slate-400">No activity yet.</p>
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {activity.map(a => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-400 ring-1 ring-brand-200" />
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{a.actor_id ? names[a.actor_id] ?? 'Someone' : 'System'}</span>{' '}
            {describe(a, names)}
          </p>
          <p className="text-xs text-slate-400">{formatRelative(a.created_at)}</p>
        </li>
      ))}
    </ol>
  )
}
