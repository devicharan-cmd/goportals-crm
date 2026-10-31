import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Avatar, EmptyState } from '@/components/ui/primitives'
import { taskCode } from '@/lib/utils'
import { DueDate, PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { AssignButton } from '@/components/tasks/AssignButton'
import { TASK_STATUS_DOT, TASK_STATUS_LABELS, TASK_STATUS_STYLES, TASK_TERMINAL_STATUSES } from '@/lib/constants'
import type { AssigneeOption } from '@/lib/queries'
import type { TaskListItem } from '@/types/database'

export function TaskTable({
  tasks, names, hrefBase = '/tasks', showClient = true, showAssignee = true, empty, assignOptions,
}: {
  tasks: TaskListItem[]
  names: Record<string, string>
  hrefBase?: string
  showClient?: boolean
  showAssignee?: boolean
  empty?: { title: string; description?: string; action?: React.ReactNode }
  /** When set, each row gets a "Change" link to reassign (managers / super admins). */
  assignOptions?: AssigneeOption[]
}) {
  const assigneeRoles = Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.role]))
  const assigneeAvatarRoles = Object.fromEntries((assignOptions ?? []).map(option => [option.id, option.avatarRole]))

  if (tasks.length === 0) {
    return <EmptyState icon={ClipboardList} title={empty?.title ?? 'No tasks'} description={empty?.description} action={empty?.action} />
  }

  return (
    <>
      {/* Desktop table */}
      <table className="hidden w-full table-fixed text-sm md:table">
        <colgroup>
          <col style={{ width: showClient && showAssignee ? '30%' : showClient ? '38%' : showAssignee ? '35%' : '45%' }} />
          {showClient && <col style={{ width: showAssignee ? '16%' : '22%' }} />}
          <col style={{ width: showClient && showAssignee ? '12%' : showClient || showAssignee ? '15%' : '17%' }} />
          <col style={{ width: showClient && showAssignee ? '10%' : showClient ? '15%' : showAssignee ? '12%' : '18%' }} />
          {showAssignee && <col style={{ width: showClient ? '22%' : '28%' }} />}
          <col style={{ width: showClient || showAssignee ? '10%' : '20%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="px-3 py-3">Task</th>
            {showClient && <th className="px-3 py-3">Client</th>}
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Priority</th>
            {showAssignee && <th className="px-3 py-3">Assignee</th>}
            <th className="px-3 py-3">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map(t => (
            <tr key={t.id} className="group hover:bg-slate-50/80">
              <td className="px-3 py-3">
                <Link href={`${hrefBase}/${t.id}`} className="relative block h-14">
                  <span className="absolute inset-x-0 top-[calc(50%-10px)] grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2">
                    <span className="font-mono text-xs font-semibold text-slate-400">{taskCode(t.task_number)}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      {t.is_urgent && !TASK_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                      <span className="truncate font-medium text-slate-900 group-hover:text-brand-700">{t.title}</span>
                    </span>
                    <span className="col-start-2 min-w-0 truncate text-xs text-slate-400">
                      {[t.department?.name, t.platform?.name, t.source === 'client' ? 'Client request' : null].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </Link>
              </td>
              {showClient && <td className="px-3 py-3 text-slate-600">{t.client?.company_name ?? '—'}</td>}
              <td className="px-3 py-3"><StatusBadge label={TASK_STATUS_LABELS[t.status]} className={TASK_STATUS_STYLES[t.status]} dotClassName={TASK_STATUS_DOT[t.status]} /></td>
              <td className="px-3 py-3"><PriorityBadge priority={t.priority} /></td>
              {showAssignee && (
                <td className="px-3 py-3">
                  <div className="relative h-14 min-w-0">
                    {t.assignee_id ? (
                      <span className="absolute left-0 top-1/2 flex w-full min-w-0 -translate-y-1/2 items-center gap-2 text-slate-700">
                        <Avatar name={names[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" />
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
                </td>
              )}
              <td className="px-3 py-3"><DueDate date={t.due_date} status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {tasks.map(t => (
          <li key={t.id}>
            <Link href={`${hrefBase}/${t.id}`} className="block px-4 py-3 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs font-semibold text-slate-400">{taskCode(t.task_number)}</span>{t.title}</p>
                <PriorityBadge priority={t.priority} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.is_urgent && !TASK_TERMINAL_STATUSES.includes(t.status) && <UrgentBadge />}
                <StatusBadge label={TASK_STATUS_LABELS[t.status]} className={TASK_STATUS_STYLES[t.status]} dotClassName={TASK_STATUS_DOT[t.status]} />
                {showClient && t.client && <span className="text-xs text-slate-500">{t.client.company_name}</span>}
                <DueDate date={t.due_date} status={t.status} className="ml-auto" />
              </div>
            </Link>
            {showAssignee && (
              <div className="flex items-start justify-between gap-2 px-4 pb-3 text-xs">
                <span className="flex min-w-0 flex-col items-start gap-1.5 text-slate-600">
                  <span className="flex min-w-0 items-center gap-1.5">
                  {t.assignee_id
                    ? <><Avatar name={names[t.assignee_id]} role={assigneeAvatarRoles[t.assignee_id]} size="xs" /> <span className="truncate">{names[t.assignee_id] ?? '—'}</span></>
                    : <span className="italic text-slate-400">Unassigned</span>}
                  {assignOptions && !TASK_TERMINAL_STATUSES.includes(t.status) && (
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
          </li>
        ))}
      </ul>
    </>
  )
}
