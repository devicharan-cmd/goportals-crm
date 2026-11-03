import { Flame } from 'lucide-react'
import { Avatar } from '@/components/ui/primitives'
import { PRIORITY_OPTIONS, TASK_STATUS_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import type { AssigneeOption } from '@/components/tasks/AssignButton'
import type { Task } from '@/types/database'

/** Read-only task properties shown in the task detail sidebar. */
export function TaskProperties({
  task, assignees, assigneeName,
}: {
  task: Task
  assignees: AssigneeOption[]
  assigneeName: string | null
}) {
  const row = 'grid grid-cols-[100px_1fr] items-center gap-3'
  const label = 'text-xs font-medium text-slate-500'
  const value = 'min-w-0 text-sm text-slate-800'
  const currentAssignee = assignees.find(assignee => assignee.id === task.assignee_id)
  const priorityLabel = PRIORITY_OPTIONS.find(option => option.value === task.priority)?.label ?? task.priority

  return (
    <div className="space-y-3">
      <div className={row}>
        <span className={label}>Status</span>
        <span className={value}>{TASK_STATUS_LABELS[task.status]}</span>
      </div>

      <div className={row}>
        <span className={label}>Priority</span>
        <span className={value}>{priorityLabel}</span>
      </div>

      <div className={row}>
        <span className={label}>Assignee</span>
        {task.assignee_id
          ? <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800">
              <Avatar name={assigneeName} src={currentAssignee?.avatarUrl} role={currentAssignee?.avatarRole} size="xs" />
              <span className="min-w-0">
                <span className="block truncate">{assigneeName ?? '—'}</span>
                {currentAssignee?.role && <span className="block -mt-0.5 truncate text-[10px] leading-tight text-slate-500">({currentAssignee.role})</span>}
              </span>
            </span>
          : <span className="text-sm italic text-slate-400">Unassigned</span>}
      </div>

      <div className={row}>
        <span className={label}>Due date</span>
        <span className={value}>{task.due_date ? formatDate(task.due_date) : 'No due date'}</span>
      </div>

      <div className={row}>
        <span className={label}>Urgent</span>
        <span className="inline-flex items-center gap-2 text-sm text-slate-600">
          {task.is_urgent && <Flame className="h-3.5 w-3.5 text-red-600" />}
          {task.is_urgent ? 'Yes' : 'No'}
        </span>
      </div>
    </div>
  )
}
