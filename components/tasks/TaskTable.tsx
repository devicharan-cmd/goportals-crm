import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Avatar, EmptyState } from '@/components/ui/primitives'
import { taskCode } from '@/lib/utils'
import { DueDate, PriorityBadge, StatusBadge, UrgentBadge } from '@/components/ui/badges'
import { AssignButton } from '@/components/tasks/AssignButton'
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
  if (tasks.length === 0) {
    return <EmptyState icon={ClipboardList} title={empty?.title ?? 'No tasks'} description={empty?.description} action={empty?.action} />
  }

  return (
    <>
      {/* Desktop table */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="px-5 py-3">Task</th>
            {showClient && <th className="px-3 py-3">Client</th>}
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Priority</th>
            {showAssignee && <th className="px-3 py-3">Assignee</th>}
            <th className="px-5 py-3 text-right">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map(t => (
            <tr key={t.id} className="group hover:bg-slate-50/80">
              <td className="max-w-md px-5 py-3">
                <Link href={`${hrefBase}/${t.id}`} className="block">
                  <span className="flex items-center gap-2">
                    <span className="flex-shrink-0 font-mono text-xs font-semibold text-slate-400">{taskCode(t.task_number)}</span>
                    {t.is_urgent && t.status !== 'done' && <UrgentBadge />}
                    <span className="truncate font-medium text-slate-900 group-hover:text-brand-700">{t.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">
                    {[t.department?.name, t.platform?.name, t.source === 'client' ? 'Client request' : null].filter(Boolean).join(' · ') || '—'}
                  </span>
                </Link>
              </td>
              {showClient && <td className="px-3 py-3 text-slate-600">{t.client?.company_name ?? '—'}</td>}
              <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
              <td className="px-3 py-3"><PriorityBadge priority={t.priority} /></td>
              {showAssignee && (
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {t.assignee_id ? (
                      <span className="flex min-w-0 items-center gap-2 text-slate-700">
                        <Avatar name={names[t.assignee_id]} size="xs" /> <span className="truncate">{names[t.assignee_id] ?? '—'}</span>
                      </span>
                    ) : <span className="text-xs italic text-slate-400">Unassigned</span>}
                    {assignOptions && t.status !== 'done' && (
                      <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions} variant="link" />
                    )}
                  </div>
                </td>
              )}
              <td className="px-5 py-3 text-right"><DueDate date={t.due_date} status={t.status} /></td>
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
                {t.is_urgent && t.status !== 'done' && <UrgentBadge />}
                <StatusBadge status={t.status} />
                {showClient && t.client && <span className="text-xs text-slate-500">{t.client.company_name}</span>}
                <DueDate date={t.due_date} status={t.status} className="ml-auto" />
              </div>
            </Link>
            {showAssignee && (
              <div className="flex items-center justify-between gap-2 px-4 pb-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                  {t.assignee_id
                    ? <><Avatar name={names[t.assignee_id]} size="xs" /> <span className="truncate">{names[t.assignee_id] ?? '—'}</span></>
                    : <span className="italic text-slate-400">Unassigned</span>}
                </span>
                {assignOptions && t.status !== 'done' && (
                  <AssignButton taskId={t.id} currentId={t.assignee_id} options={assignOptions} variant="link" />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
