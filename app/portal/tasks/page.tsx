import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalNames } from '@/lib/portal'
import { TASK_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/primitives'
import { TaskTable } from '@/components/tasks/TaskTable'
import { cn, parseTaskCode } from '@/lib/utils'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'My tasks' }

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Completed' },
  { key: 'all',  label: 'All' },
]

export default async function PortalTasksPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const me = await requireClient()
  const supabase = createClient()
  const tab = TABS.some(t => t.key === searchParams.status) ? searchParams.status! : 'open'

  let query = supabase.from('tasks').select(TASK_LIST_SELECT).order('created_at', { ascending: false })
  const idSearch = parseTaskCode(searchParams.q)
  if (idSearch) query = query.eq('task_number', idSearch)
  else {
    if (searchParams.q) query = query.ilike('title', `%${searchParams.q.replace(/[%_,()]/g, ' ')}%`)
    if (tab === 'open') query = query.neq('status', 'done')
    if (tab === 'done') query = query.eq('status', 'done')
  }
  const [{ data }, names] = await Promise.all([query, getPortalNames(me)])

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Everything you've asked us to do, and what we're working on for you."
        actions={<ButtonLink href="/portal/tasks/new"><Plus className="h-4 w-4" /> New request</ButtonLink>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
        {TABS.map(t => (
          <Link key={t.key} href={t.key === 'open' ? '/portal/tasks' : `/portal/tasks?status=${t.key}`}
                className={cn('rounded-md px-3 py-1 font-medium', tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
            {t.label}
          </Link>
        ))}
      </div>
      <form className="relative min-w-[220px] flex-1 sm:max-w-xs">
        {tab !== 'open' && <input type="hidden" name="status" value={tab} />}
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input name="q" defaultValue={searchParams.q} placeholder="Search title or GP-1024…" className="input h-9 pl-9" />
      </form>
      </div>
      <Card className="overflow-hidden">
        <TaskTable tasks={(data ?? []) as TaskListItem[]} names={names} hrefBase="/portal/tasks" showClient={false}
                   empty={{ title: tab === 'done' ? 'Nothing completed yet' : 'No open requests' }} />
      </Card>
    </>
  )
}
