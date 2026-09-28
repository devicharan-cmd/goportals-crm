'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { KanbanSquare, List, Search } from 'lucide-react'
import { STATUS_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string }

/** URL-driven filters for the task list (server page reads searchParams). */
export function TaskFilters({
  clients, people, departments, showScope,
}: { clients: Option[]; people: Option[]; departments: Option[]; showScope: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`${pathname}?${next.toString()}`)
  }

  // Debounced search
  useEffect(() => {
    if (q === (params.get('q') ?? '')) return
    const t = setTimeout(() => set('q', q), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const view = params.get('view') ?? 'list'
  const scope = params.get('scope') ?? 'mine'
  const select = 'input h-9 w-auto py-1.5 pr-8 text-sm'

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="flex items-center gap-2">
        {showScope && (
          <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
            {[{ v: 'mine', l: 'My tasks' }, { v: 'all', l: 'All I can see' }].map(o => (
              <button key={o.v} onClick={() => set('scope', o.v === 'mine' ? '' : o.v)}
                      className={cn('rounded-md px-3 py-1 font-medium transition', scope === o.v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                {o.l}
              </button>
            ))}
          </div>
        )}
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {[{ v: 'list', i: List }, { v: 'board', i: KanbanSquare }].map(o => (
            <button key={o.v} onClick={() => set('view', o.v === 'list' ? '' : o.v)} aria-label={`${o.v} view`}
                    className={cn('rounded-md p-1.5 transition', view === o.v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              <o.i className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
        <div className="relative min-w-[180px] flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or GP-1024…" className="input h-9 pl-9" />
        </div>
        {view !== 'board' && (
          <select className={select} value={params.get('status') ?? 'active'} onChange={e => set('status', e.target.value === 'active' ? '' : e.target.value)}>
            <option value="active">Not done</option>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        <select className={select} value={params.get('client') ?? ''} onChange={e => set('client', e.target.value)}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {showScope && scope === 'all' && (
          <select className={select} value={params.get('assignee') ?? ''} onChange={e => set('assignee', e.target.value)}>
            <option value="">Anyone</option>
            <option value="none">Unassigned</option>
            {people.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        )}
        <select className={select} value={params.get('dept') ?? ''} onChange={e => set('dept', e.target.value)}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>
    </div>
  )
}
