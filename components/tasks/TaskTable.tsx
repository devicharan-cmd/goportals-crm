import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Avatar, EmptyState } from '@/components/ui/primitives'
import { dueState, formatDate, taskCode } from '@/lib/utils'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { AssignButton } from '@/components/tasks/AssignButton'
import { MarketplacePlatformLabel } from '@/components/shared/Marketplace'
import { ROLE_LABELS, TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES, TASK_TERMINAL_STATUSES } from '@/lib/constants'
import type { AssigneeOption, TaskAssignerInfo } from '@/lib/queries'
import type { TaskSummary } from '@/types/database'

function TaskDueDisplay({ task, className, rowAligned = false }: { task: TaskSummary; className?: string; rowAligned?: boolean }) {
  const isOverdue = dueState(task.due_date, task.status) === 'overdue'

  return (
    <span className={`${rowAligned ? 'relative block h-14' : 'flex w-fit flex-col items-start gap-0.5'} text-xs ${className ?? ''}`}>
      <span className={`${rowAligned ? 'absolute left-0 top-[calc(50%-7px)]' : 'block'} ${task.due_date ? 'text-slate-600' : 'text-slate-400'}`}>
        {task.due_date ? formatDate(task.due_date) : 'No due date'}
      </span>
      {isOverdue && (
        <span className={`${rowAligned ? 'absolute left-0 top-[calc(50%+11px)]' : 'block'} rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-red-700`}>
          Overdue
        </span>
      )}
    </span>
  )
}

export function TaskTable({
  tasks, names, hrefBase = '/tasks', showClient = true, showAssignee = true, showAssignedBy = false,
  taskAssigners = {}, empty, assignOptions, scope,
}: {
  tasks: TaskSummary[]
  names: Record<string, string>
  hrefBase?: string
  showClient?: boolean
  showAssignee?: boolean
  showAssignedBy?: boolean
  scope?: 'mine' | 'assigned' | 'all'
  taskAssigners?: Record<string, TaskAssignerInfo>
  empty?: { title: string; description?: string; action?: React.ReactNode }
  /** When set, each row gets a "Change" link to reassign (managers / super admins). */
  assignOptions?: AssigneeOption[]
}) {
  const taskHref = (taskId: string) =>
    `${hrefBase}/${taskId}${scope ? `?scope=${scope}` : ''}`
  const assigneeRoles = Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.role]))
  const assigneeAvatarRoles = Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.avatarRole]))
  const assigneeAvatarUrls = Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.avatarUrl]))
  const showReassignColumn = showAssignedBy && showAssignee && Boolean(assignOptions)
  const assignedByColumnWidths = [
    8,
    16,
    ...(showClient ? [13] : []),
    9,
    7,
    ...(showAssignedBy ? [14] : []),
    ...(showAssignee ? [14] : []),
    10,
    ...(showReassignColumn ? [9] : []),
  ]
  const assignedByColumnWidthTotal = assignedByColumnWidths.reduce((total, width) => total + width, 0)

  if (tasks.length === 0) {
    return <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={empty?.title ?? 'No tasks'} description={empty?.description} action={empty?.action} />
  }

  return (
    <>
      {/* Desktop table */}
      <table className="hidden w-full table-fixed text-sm md:table">
        <colgroup>
          {showAssignedBy ? (
            assignedByColumnWidths.map((width, index) => (
              <col key={index} style={{ width: `${width / assignedByColumnWidthTotal * 100}%` }} />
            ))
          ) : (
            <>
              <col style={{ width: showClient && showAssignee ? '26%' : showClient ? '39%' : showAssignee ? '35%' : '45%' }} />
          {showClient && <col style={{ width: showAssignee ? '16%' : '18%' }} />}
          <col style={{ width: showClient && showAssignee ? '12%' : showClient ? '14%' : showAssignee ? '15%' : '17%' }} />
          <col style={{ width: showClient && showAssignee ? '10%' : showClient ? '15%' : showAssignee ? '12%' : '18%' }} />
          {showAssignee && <col style={{ width: showClient ? '20%' : '28%' }} />}
          <col style={{ width: showClient ? (showAssignee ? '16%' : '14%') : showAssignee ? '10%' : '20%' }} />
            </>
          )}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            {showAssignedBy ? (
              <>
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Task</th>
              </>
            ) : <th className="px-3 py-3">Task</th>}
            {showClient && <th className="px-3 py-3">Client</th>}
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Priority</th>
            {showAssignedBy && <th className="px-3 py-3">Assigned by</th>}
            {showAssignee && <th className="px-3 py-3">Assignee</th>}
            <th className={showAssignedBy ? 'px-2 py-3' : 'px-3 py-3'}>Due</th>
            {showReassignColumn && <th className="px-2 py-3">Reassign</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map(t => (
            <tr key={t.id} className="group hover:bg-slate-50/80">
              {showAssignedBy && (
                <td className="px-3 py-3 font-mono text-xs font-semibold text-[#045E80]">
                  <Link href={taskHref(t.id)} className="text-[#045E80] hover:text-[#034C68]">{taskCode(t.task_number)}</Link>
                </td>
              )}
              <td className="px-3 py-3">
                <Link href={taskHref(t.id)} className="relative block h-14">
                  <span className={`absolute inset-x-0 top-[calc(50%-10px)] grid gap-x-2 ${showAssignedBy ? 'grid-cols-1' : 'grid-cols-[max-content_minmax(0,1fr)]'}`}>
                    {!showAssignedBy && <span className="font-mono text-xs font-semibold text-[#045E80]">{taskCode(t.task_number)}</span>}
                    <span className={`${showAssignedBy ? '' : 'col-start-2'} flex min-w-0 items-center gap-2`}>
                      {t.is_urgent && !TASK_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                      <span className="truncate font-medium text-slate-900">{t.title}</span>
                    </span>
                    <span className={`${showAssignedBy ? '' : 'col-start-2'} flex min-w-0 items-center gap-1 truncate text-xs text-slate-400`}>
                      {t.department?.name}
                      {t.department?.name && t.platform?.name && <span aria-hidden="true">·</span>}
                      {t.platform?.name && <MarketplacePlatformLabel name={t.platform.name} />}
                      {(t.department?.name || t.platform?.name) && t.source === 'client' && <span aria-hidden="true">·</span>}
                      {t.source === 'client' ? 'Client request' : ''}
                      {!t.department?.name && !t.platform?.name && t.source !== 'client' && '—'}
                    </span>
                  </span>
                </Link>
              </td>
              {showClient && <td className="px-3 py-3 text-slate-600">{t.client?.company_name ?? '—'}</td>}
              <td className="px-3 py-3"><StatusBadge label={TASK_STATUS_LABELS[t.status]} className={TASK_STATUS_STYLES[t.status]} dotClassName={TASK_STATUS_DOT[t.status]} /></td>
              <td className="px-3 py-3"><PriorityBadge priority={t.priority} /></td>
              {showAssignedBy && (
                <td className="px-3 py-3 text-slate-700">
                  {t.assigned_by && taskAssigners[t.assigned_by] ? (
                    <span className="flex h-14 min-w-0 items-center gap-2">
                      <Avatar
                        name={taskAssigners[t.assigned_by].name}
                        src={taskAssigners[t.assigned_by].avatarUrl}
                        role={taskAssigners[t.assigned_by].role}
                        size="xs"
                      />
                      <span className="relative h-14 min-w-0 flex-1">
                        <span className="absolute left-0 top-1/2 w-full -translate-y-1/2 truncate">{taskAssigners[t.assigned_by].name}</span>
                        <span className="absolute left-0 top-[calc(50%+13px)] w-full -translate-y-1/2 truncate text-[10px] text-slate-400">({ROLE_LABELS[taskAssigners[t.assigned_by].role]})</span>
                      </span>
                    </span>
                  ) : '—'}
                </td>
              )}
              {showAssignee && (
                <td className="px-3 py-3">
                  {showAssignedBy ? (
                    <span className="flex h-14 min-w-0 items-center gap-2 text-slate-700">
                      {t.assignee_id ? (
                        <>
                          <Avatar name={names[t.assignee_id]} src={assigneeAvatarUrls[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" />
                          <span className="relative h-14 min-w-0 flex-1">
                            <span className="absolute left-0 top-1/2 w-full -translate-y-1/2 truncate">{names[t.assignee_id] ?? '—'}</span>
                            {assigneeRoles[t.assignee_id] && <span className="absolute left-0 top-[calc(50%+13px)] w-full -translate-y-1/2 truncate text-[10px] text-slate-400">({assigneeRoles[t.assignee_id]})</span>}
                          </span>
                        </>
                      ) : <span className="italic text-slate-400">Unassigned</span>}
                    </span>
                  ) : (
                    <div className="relative h-14 min-w-0">
                      {t.assignee_id ? (
                        <span className="absolute left-0 top-1/2 flex w-full min-w-0 -translate-y-1/2 items-center gap-2 text-slate-700">
                          <Avatar name={names[t.assignee_id]} src={assigneeAvatarUrls[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" />
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{names[t.assignee_id] ?? '—'}</span>
                            {assignOptions && !TASK_TERMINAL_STATUSES.includes(t.status) && (
                              <span className="shrink-0">
                                <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions} compact />
                              </span>
                            )}
                          </span>
                        </span>
                      ) : <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs italic text-slate-400">Unassigned</span>}
                      {t.assignee_id && assigneeRoles[t.assignee_id] && (
                        <span className="absolute left-7 top-[calc(50%+18px)] -translate-y-1/2 truncate text-[10px] text-slate-400">
                          ({assigneeRoles[t.assignee_id]})
                        </span>
                      )}
                    </div>
                  )}
                </td>
              )}
              <td className={showAssignedBy ? 'px-2 py-3' : 'px-3 py-3'}><TaskDueDisplay task={t} rowAligned /></td>
              {showReassignColumn && (
                <td className="px-2 py-3 text-center">
                  {!TASK_TERMINAL_STATUSES.includes(t.status) && (
                    <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions!} compact />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {tasks.map(t => (
          <li key={t.id}>
            <Link href={taskHref(t.id)} className="block px-4 py-3 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs font-semibold text-[#045E80]">{taskCode(t.task_number)}</span>{t.title}</p>
                <PriorityBadge priority={t.priority} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.is_urgent && !TASK_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                <StatusBadge label={TASK_STATUS_LABELS[t.status]} className={TASK_STATUS_STYLES[t.status]} dotClassName={TASK_STATUS_DOT[t.status]} />
                {showClient && t.client && <span className="text-xs text-slate-500">{t.client.company_name}</span>}
                <TaskDueDisplay task={t} className="ml-auto" />
              </div>
            </Link>
            {showAssignee && (
              <div className="flex items-start justify-between gap-2 px-4 pb-3 text-xs">
                <span className="flex min-w-0 flex-col items-start gap-1.5 text-slate-600">
                  <span className="flex min-w-0 items-center gap-1.5">
                  {t.assignee_id
                    ? <><Avatar name={names[t.assignee_id]} src={assigneeAvatarUrls[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" /> <span className="truncate">{names[t.assignee_id] ?? '—'}</span></>
                    : <span className="italic text-slate-400">Unassigned</span>}
                  {assignOptions && !showReassignColumn && !TASK_TERMINAL_STATUSES.includes(t.status) && (
                    <span className="shrink-0">
                      <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions} compact />
                    </span>
                  )}
                  </span>
                  {t.assignee_id && assigneeRoles[t.assignee_id] && (
                    <span className="ml-7 text-[10px] text-slate-400">({assigneeRoles[t.assignee_id]})</span>
                  )}
                </span>
              </div>
            )}
            {showAssignedBy && t.assigned_by && taskAssigners[t.assigned_by] && (
              <div className="flex min-w-0 items-center gap-2 px-4 pb-3 text-xs text-slate-500">
                <Avatar
                  name={taskAssigners[t.assigned_by].name}
                  src={taskAssigners[t.assigned_by].avatarUrl}
                  role={taskAssigners[t.assigned_by].role}
                  size="xs"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{taskAssigners[t.assigned_by].name}</span>
                  <span className="truncate">({ROLE_LABELS[taskAssigners[t.assigned_by].role]})</span>
                </span>
              </div>
            )}
            {showReassignColumn && !TASK_TERMINAL_STATUSES.includes(t.status) && (
              <div className="flex justify-end px-4 pb-3">
                <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions!} compact />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
