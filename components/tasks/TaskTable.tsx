import Link from 'next/link'
import { ClipboardList, LockKeyhole } from 'lucide-react'
import { Avatar, EmptyState } from '@/components/ui/primitives'
import { dueState, formatDate, taskCode } from '@/lib/utils'
import { PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { AssignButton } from '@/components/tasks/AssignButton'
import { MarketplacePlatformLabel } from '@/components/shared/Marketplace'
import { ROLE_LABELS, TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES, TASK_TERMINAL_STATUSES } from '@/lib/constants'
import type { AssigneeOption, TaskAssignerInfo } from '@/lib/queries'
import type { AppRole, TaskSummary } from '@/types/database'

function TaskDueDisplay({ task, className, rowAligned = false }: { task: TaskSummary; className?: string; rowAligned?: boolean }) {
  const isOverdue = dueState(task.due_date, task.status, new Date(), task.due_at) === 'overdue'

  return (
    <span className={`${rowAligned ? 'relative block h-14 text-center' : 'flex w-fit flex-col items-start gap-0.5'} text-xs ${className ?? ''}`}>
      <span className={`${rowAligned ? 'absolute left-1/2 top-[calc(50%-7px)] -translate-x-1/2' : 'block'} whitespace-nowrap ${task.due_date ? 'text-slate-600' : 'text-slate-400'}`}>
        {task.due_date ? formatDate(task.due_date) : 'No due date'}
      </span>
      {isOverdue && (
        <span className={`${rowAligned ? 'absolute left-1/2 top-[calc(50%+11px)] -translate-x-1/2' : 'block'} whitespace-nowrap rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-medium leading-4 text-red-700`}>
          Overdue
        </span>
      )}
    </span>
  )
}

export function TaskTable({
  tasks, names, hrefBase = '/tasks', showClient = true, showAssignee = true, showAssignedBy = false,
  taskAssigners = {}, empty, assignOptions, scope, editableTaskActorId, editableTaskRole,
  assigneeAvatarUrls: suppliedAssigneeAvatarUrls = {},
}: {
  tasks: TaskSummary[]
  names: Record<string, string>
  hrefBase?: string
  showClient?: boolean
  showAssignee?: boolean
  showAssignedBy?: boolean
  scope?: 'mine' | 'assigned' | 'all'
  assigneeAvatarUrls?: Record<string, string | null | undefined>
  taskAssigners?: Record<string, TaskAssignerInfo>
  empty?: { title: string; description?: string; action?: React.ReactNode }
  /** When set, each row gets a reassignment control according to task ownership/role rules. */
  assignOptions?: AssigneeOption[]
  editableTaskActorId?: string
  editableTaskRole?: AppRole
}) {
  const taskHref = (taskId: string) =>
    `${hrefBase}/${taskId}${scope ? `?scope=${scope}` : ''}`
  const assigneeNames = {
    ...names,
    ...Object.fromEntries(Object.entries(taskAssigners).map(([id, person]) => [id, person.name])),
    ...Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.name])),
  }
  const assigneeRoles = {
    ...Object.fromEntries(Object.entries(taskAssigners).map(([id, person]) => [id, ROLE_LABELS[person.role]])),
    ...Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.role])),
  }
  const assigneeAvatarRoles = {
    ...Object.fromEntries(Object.entries(taskAssigners).map(([id, person]) => [id, person.role])),
    ...Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.avatarRole])),
  }
  const assigneeAvatarUrls = {
    ...Object.fromEntries(Object.entries(taskAssigners).map(([id, person]) => [id, person.avatarUrl])),
    ...Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.avatarUrl])),
    ...suppliedAssigneeAvatarUrls,
  }
  const ticketLabel = (task: TaskSummary) => task.ticket_id
    ? 'Under ticket'
    : task.ticket_id === null ? 'Standalone task' : '—'
  const canReassignTask = (task: TaskSummary) => {
    if (!assignOptions || task.task_group_id || TASK_TERMINAL_STATUSES.includes(task.status)) return false
    const selfAssigned = Boolean(task.assignee_id
      && task.created_by
      && task.assigned_by
      && task.created_by === task.assignee_id
      && task.assigned_by === task.assignee_id)
    return selfAssigned
      ? task.assignee_id === editableTaskActorId
      : editableTaskRole !== 'employee'
  }
  const showReassignColumn = showAssignedBy && showAssignee && Boolean(assignOptions) && editableTaskRole !== 'employee'
  const assignedByColumnWidths = [
    8,
    22,
    ...(showClient ? [12] : []),
    9,
    7,
    ...(showAssignedBy ? [12] : []),
    ...(showAssignee ? [13] : []),
    8,
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
              <col style={{ width: '9%' }} />
              <col style={{ width: showClient && showAssignee ? '16%' : showClient ? '26%' : showAssignee ? '20%' : '34%' }} />
          {showClient && <col style={{ width: showAssignee ? '15%' : '18%' }} />}
          <col style={{ width: showClient && showAssignee ? '18%' : showClient ? '18%' : showAssignee ? '18%' : '20%' }} />
          <col style={{ width: showClient && showAssignee ? '8%' : showClient ? '13%' : showAssignee ? '11%' : '17%' }} />
          {showAssignee && <col style={{ width: showClient ? '19%' : '26%' }} />}
          <col style={{ width: showClient ? (showAssignee ? '15%' : '16%') : showAssignee ? '16%' : '20%' }} />
            </>
          )}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            {showAssignedBy ? (
              <>
                <th className="whitespace-nowrap px-3 py-3 text-center">Task ID</th>
                <th className="px-3 py-3">Task title</th>
              </>
            ) : (
              <>
                <th className="whitespace-nowrap px-3 py-3 text-center">Task ID</th>
                <th className="px-3 py-3">Task title</th>
              </>
            )}
            {showClient && <th className="px-3 py-3 text-center">Client</th>}
            <th className="px-3 py-3 text-center">Status</th>
            <th className="px-3 py-3 text-center">Priority</th>
            {showAssignedBy && <th className="px-3 py-3 text-center">Assigned by</th>}
            {showAssignee && <th className="px-3 py-3 text-center">Assignee</th>}
            <th className={showAssignedBy ? 'px-2 py-3 text-center' : 'px-3 py-3 text-center'}>Due date</th>
            {showReassignColumn && <th className="px-2 py-3 text-center">Reassign</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map(t => (
            <tr key={t.id} className="group hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-3 py-3 text-center font-mono text-xs font-semibold text-[#045E80]">
                <Link href={taskHref(t.id)} prefetch={false} className="text-[#045E80] hover:text-[#034C68]">{taskCode(t.task_number)}</Link>
              </td>
              <td className="px-3 py-3">
                <Link href={taskHref(t.id)} prefetch={false} className="relative block h-14">
                  <span className="absolute inset-x-0 top-[calc(50%-10px)] grid grid-rows-[auto_auto] gap-y-1">
                    <span className="flex min-w-0 items-center gap-2">
                      {t.is_urgent && !TASK_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                      <span className="truncate font-medium text-slate-900">{t.title}</span>
                      {t.visibility === 'private' && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-violet-700 ring-1 ring-inset ring-violet-200">
                          <LockKeyhole aria-hidden="true" className="h-3 w-3" /> Private
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 truncate text-xs text-slate-400">
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
              {showClient && <td className="px-3 py-3 text-center text-slate-600">{t.client?.company_name ?? '—'}</td>}
              <td className="px-3 py-3 text-center"><span className="flex justify-center"><StatusBadge label={TASK_STATUS_LABELS[t.status]} className={TASK_STATUS_STYLES[t.status]} dotClassName={TASK_STATUS_DOT[t.status]} /></span></td>
              <td className="px-3 py-3 text-center"><span className="flex justify-center"><PriorityBadge priority={t.priority} /></span></td>
              {showAssignedBy && (
                <td className="px-3 py-3 text-center text-slate-700">
                  {t.assigned_by && taskAssigners[t.assigned_by] ? (
                    <span className="mx-auto flex h-14 min-w-0 max-w-full translate-y-1.5 items-center justify-center gap-2 text-left">
                      <span className="flex min-w-0 items-start gap-2">
                        <Avatar
                          name={taskAssigners[t.assigned_by].name}
                          src={taskAssigners[t.assigned_by].avatarUrl}
                          role={taskAssigners[t.assigned_by].role}
                          size="xs"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{taskAssigners[t.assigned_by].name}</span>
                          <span className="truncate text-xs leading-4 text-slate-400">{ROLE_LABELS[taskAssigners[t.assigned_by].role]}</span>
                        </span>
                      </span>
                    </span>
                  ) : '—'}
                </td>
              )}
              {showAssignee && (
                <td className="px-3 py-3 text-center">
                  {showAssignedBy ? (
                    <span className="mx-auto flex min-h-14 min-w-0 max-w-full translate-y-1.5 items-center justify-center gap-2 text-left text-slate-700">
                      {t.assignee_id ? (
                        <span className="flex min-w-0 items-start gap-2">
                          <Avatar name={assigneeNames[t.assignee_id]} src={assigneeAvatarUrls[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" className="self-start" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{assigneeNames[t.assignee_id] ?? '—'}</span>
                            {assigneeRoles[t.assignee_id] && <span className="truncate text-xs leading-4 text-slate-400">{assigneeRoles[t.assignee_id]}</span>}
                          </span>
                        </span>
                      ) : <span className="italic text-slate-400">Unassigned</span>}
                    </span>
                  ) : (
                    <div className="min-w-0 space-y-1">
                      {t.assignee_id ? (
                        <span className="flex min-w-0 items-start gap-2 text-slate-700">
                          <Avatar name={assigneeNames[t.assignee_id]} src={assigneeAvatarUrls[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" className="mt-0.5" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{assigneeNames[t.assignee_id] ?? '—'}</span>
                            {assigneeRoles[t.assignee_id] && <span className="truncate text-xs leading-4 text-slate-400">{assigneeRoles[t.assignee_id]}</span>}
                          </span>
                          {canReassignTask(t) && (
                            <span className="shrink-0">
                          <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions!} clientId={t.client_id ?? null} allowClientAssignee={t.visibility === 'public'} taskVisibility={t.visibility} ticketLabel={ticketLabel(t)} compact />
                            </span>
                          )}
                        </span>
                      ) : <span className="text-xs italic text-slate-400">Unassigned</span>}
                    </div>
                  )}
                </td>
              )}
              <td className={showAssignedBy ? 'px-2 py-3 text-center' : 'px-3 py-3 text-center'}><TaskDueDisplay task={t} rowAligned /></td>
              {showReassignColumn && (
                <td className="px-2 py-3 text-center">
                  {canReassignTask(t) && (
                    <span className="flex justify-center">
                      <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions!} clientId={t.client_id ?? null} allowClientAssignee={t.visibility === 'public'} taskVisibility={t.visibility} ticketLabel={ticketLabel(t)} compact />
                    </span>
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
          <li key={t.id} className="grid grid-cols-1 min-[560px]:grid-cols-2">
            <Link href={taskHref(t.id)} prefetch={false} className="block px-4 py-3 active:bg-slate-50 min-[560px]:col-span-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs font-semibold text-[#045E80]">{taskCode(t.task_number)}</span>{t.title}</p>
                <PriorityBadge priority={t.priority} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.is_urgent && !TASK_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                <StatusBadge label={TASK_STATUS_LABELS[t.status]} className={TASK_STATUS_STYLES[t.status]} dotClassName={TASK_STATUS_DOT[t.status]} />
                {t.visibility === 'private' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-violet-700 ring-1 ring-inset ring-violet-200">
                    <LockKeyhole aria-hidden="true" className="h-3 w-3" /> Private
                  </span>
                )}
                {showClient && t.client && <span className="text-xs text-slate-500">{t.client.company_name}</span>}
                <TaskDueDisplay task={t} className="ml-auto" />
              </div>
            </Link>
            {showAssignee && (
              <div className="flex min-w-0 items-start justify-between gap-2 px-4 pb-3 text-xs min-[560px]:min-h-14 min-[560px]:items-center">
                <span className="flex min-w-0 flex-col items-start gap-1.5 text-slate-600">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Assignee</span>
                  <span className="flex min-w-0 items-start gap-1.5">
                  {t.assignee_id
                    ? <><Avatar name={assigneeNames[t.assignee_id]} src={assigneeAvatarUrls[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" className="mt-0.5" /> <span className="truncate">{assigneeNames[t.assignee_id] ?? '—'}</span></>
                    : <span className="italic text-slate-400">Unassigned</span>}
                  {canReassignTask(t) && !showReassignColumn && (
                    <span className="shrink-0">
                      <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions!} clientId={t.client_id ?? null} allowClientAssignee={t.visibility === 'public'} taskVisibility={t.visibility} ticketLabel={ticketLabel(t)} compact />
                    </span>
                  )}
                  </span>
                  {t.assignee_id && assigneeRoles[t.assignee_id] && (
                    <span className="ml-7 text-xs text-slate-400">{assigneeRoles[t.assignee_id]}</span>
                  )}
                </span>
              </div>
            )}
            {showAssignedBy && t.assigned_by && taskAssigners[t.assigned_by] && (
              <div className="flex min-w-0 flex-col items-start gap-1.5 px-4 pb-3 text-xs text-slate-500 min-[560px]:min-h-14">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Assigned by</span>
                <span className="flex min-w-0 items-start gap-2">
                  <Avatar
                    name={taskAssigners[t.assigned_by].name}
                    src={taskAssigners[t.assigned_by].avatarUrl}
                    role={taskAssigners[t.assigned_by].role}
                    size="xs"
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{taskAssigners[t.assigned_by].name}</span>
                    <span className="truncate">{ROLE_LABELS[taskAssigners[t.assigned_by].role]}</span>
                  </span>
                </span>
              </div>
            )}
            {showReassignColumn && canReassignTask(t) && (
              <div className="flex justify-end px-4 pb-3 min-[560px]:col-span-2">
                <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions!} clientId={t.client_id ?? null} allowClientAssignee={t.visibility === 'public'} taskVisibility={t.visibility} ticketLabel={ticketLabel(t)} compact />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
