'use client'

import { useState } from 'react'
import { AlertTriangle, Flame, X } from 'lucide-react'
import { StaffIdentity } from '@/components/ui/primitives'
import { PRIORITY_OPTIONS, TASK_STATUS_LABELS } from '@/lib/constants'
import { formatDate, formatRelative } from '@/lib/utils'
import type { AssigneeOption } from '@/components/tasks/AssignButton'
import { TaskStatusSelect } from '@/components/tasks/TaskStatusSelect'
import { TaskPrioritySelect, TaskUrgentToggle } from '@/components/tasks/TaskPropertyControls'
import type { AppRole, Task, TaskStatus } from '@/types/database'

/** Task properties and permitted inline controls shown in the task detail sidebar. */
export function TaskProperties({
  task, assignees, assigneeName, assignedBy, assignedAt, canChangeStatus = false, canCompleteReview = false,
  canEditPriority = false, canEditUrgent = false,
}: {
  task: Task
  assignees: AssigneeOption[]
  assigneeName: string | null
  assignedBy?: { name: string; avatarUrl: string | null; role: AppRole } | null
  assignedAt?: string | null
  canChangeStatus?: boolean
  canCompleteReview?: boolean
  canEditPriority?: boolean
  canEditUrgent?: boolean
}) {
  const [statusWarning, setStatusWarning] = useState('')
  const row = 'grid grid-cols-[100px_1fr] items-center gap-3'
  const label = 'text-xs font-medium text-slate-500'
  const value = 'min-w-0 text-sm text-slate-800'
  const currentAssignee = assignees.find(assignee => assignee.id === task.assignee_id)
  const priorityLabel = PRIORITY_OPTIONS.find(option => option.value === task.priority)?.label ?? task.priority
  return (
    <div className="space-y-3">
      {statusWarning && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-2 text-xs text-amber-800">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">{statusWarning}</span>
          <button
            type="button"
            aria-label="Dismiss warning"
            onClick={() => setStatusWarning('')}
            className="flex-shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      <div className={row}>
        <span className={label}>Status</span>
        {canChangeStatus
          ? <TaskStatusSelect
              taskId={task.id}
              status={task.status as TaskStatus}
              visibility={task.visibility}
              canCompleteReview={canCompleteReview}
              onWarning={setStatusWarning}
            />
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
          ? <StaffIdentity
              name={assigneeName}
              src={currentAssignee?.avatarUrl}
              role={currentAssignee?.avatarRole}
              roleLabel={currentAssignee?.role}
            />
          : <span className="text-sm italic text-slate-400">Unassigned</span>}
      </div>

      {assignedBy && (
        <div className={row}>
          <span className={label}>Assigned by</span>
          <StaffIdentity name={assignedBy.name} src={assignedBy.avatarUrl} role={assignedBy.role} />
        </div>
      )}

      {assignedAt && (
        <div className={row}>
          <span className={label}>Assigned</span>
          <span className={value}>
            {formatDate(assignedAt)}
            <span className="block text-xs text-slate-500">{formatRelative(assignedAt)}</span>
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
