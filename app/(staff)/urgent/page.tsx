import Link from 'next/link'
import { Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { TASK_LIST_SELECT } from '@/lib/queries'
import { Avatar, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { DueDate, PriorityBadge, StatusBadge } from '@/components/ui/badges'
import { ClaimButton } from '@/components/tasks/ClaimButton'
import { formatRelative, taskCode } from '@/lib/utils'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'Urgent pool' }

export default async function UrgentPage() {
  await requireStaff()
  const supabase = createClient()
  const [{ data }, { data: people }] = await Promise.all([
    supabase.from('tasks').select(TASK_LIST_SELECT).eq('is_urgent', true).neq('status', 'done')
      .order('priority').order('created_at'),
    supabase.from('staff_directory').select('id, full_name'),
  ])
  const tasks = (data ?? []) as TaskListItem[]
  const names = Object.fromEntries((people ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]))
  const open = tasks.filter(t => !t.assignee_id)
  const taken = tasks.filter(t => t.assignee_id)

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Flame className="h-6 w-6 text-red-600" /> Urgent pool</span>}
        description="Urgent work anyone on the team can pick up. First to pick it up gets it."
      />

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={`Waiting for someone (${open.length})`} />
        {open.length === 0 ? (
          <EmptyState icon={Flame} title="All clear" description="No urgent tasks are waiting right now." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map(t => (
              <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-400">{taskCode(t.task_number)}</span>
                    <PriorityBadge priority={t.priority} />
                    <p className="truncate font-semibold text-slate-900 hover:text-brand-700">{t.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[t.client?.company_name, t.department?.name, t.platform?.name].filter(Boolean).join(' · ')} · raised {formatRelative(t.created_at)}
                  </p>
                </Link>
                <div className="flex items-center gap-4">
                  <DueDate date={t.due_date} status={t.status} />
                  <ClaimButton taskId={t.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {taken.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title={`Being handled (${taken.length})`} />
          <ul className="divide-y divide-slate-100">
            {taken.map(t => (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Avatar name={names[t.assignee_id!]} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900"><span className="mr-1.5 font-mono text-xs text-slate-400">{taskCode(t.task_number)}</span>{t.title}</p>
                    <p className="text-xs text-slate-500">{names[t.assignee_id!] ?? '—'} · {t.client?.company_name}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
