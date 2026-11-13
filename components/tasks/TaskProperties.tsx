import { Flame } from 'lucide-react'
import { Avatar } from '@/components/ui/primitives'
import { PRIORITY_OPTIONS, ROLE_LABELS, TASK_STATUS_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import type { AssigneeOption } from '@/components/tasks/AssignButton'
import { TaskStatusSelect } from '@/components/tasks/TaskStatusSelect'
import { TaskPrioritySelect, TaskUrgentToggle } from '@/components/tasks/TaskPropertyControls'
import type { AppRole, Task, TaskStatus } from '@/types/database'

/** Task properties and permitted inline controls shown in the task detail sidebar. */
export function TaskProperties({
  task, assignees, assigneeName, assignedBy, canChangeStatus = false, canCompleteReview = false,
  canEditPriority = false, canEditUrgent = false,
}: {
  task: Task
  assignees: AssigneeOption[]
  assigneeName: string | null
  assignedBy?: { name: string; avatarUrl: string | null; role: AppRole } | null
  canChangeStatus?: boolean
  canCompleteReview?: boolean
  canEditPriority?: boolean
  canEditUrgent?: boolean
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
        {canChangeStatus
          ? <TaskStatusSelect taskId={task.id} status={task.status as TaskStatus} canCompleteReview={canCompleteReview} />
          : <span className={value}>{TASK_STATUS_LABELS[task.status]}</span>}
      </div>

      <div className={row}>
        <span className={label}>Priority</span>
        {canEditPriority
          ? <TaskPrioritySelect taskId={task.id} priority={task.priority} />
          : <span className={value}>{priorityLabel}</span>}
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

      {assignedBy && (
        <div className={row}>
          <span className={label}>Assigned by</span>
          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800">
            <Avatar name={assignedBy.name} src={assignedBy.avatarUrl} role={assignedBy.role} size="xs" />
            <span className="min-w-0">
              <span className="block truncate">{assignedBy.name}</span>
              <span className="block -mt-0.5 truncate text-[10px] leading-tight text-slate-500">({ROLE_LABELS[assignedBy.role]})</span>
            </span>
          </span>
        </div>
      )}

      <div className={row}>
        <span className={label}>Due date</span>
        <span className={value}>{task.due_date ? formatDate(task.due_date) : 'No due date'}</span>
      </div>

      <div className={row}>
        <span className={label}>Urgent</span>
        {canEditUrgent
          ? <TaskUrgentToggle taskId={task.id} isUrgent={task.is_urgent} />
          : <span className="inline-flex items-center gap-2 text-sm text-slate-600">
              {task.is_urgent && <Flame className="h-3.5 w-3.5 text-red-600" />}
              {task.is_urgent ? 'Yes' : 'No'}
            </span>}
      </div>
    </div>
  )
}
