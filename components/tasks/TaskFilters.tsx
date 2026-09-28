'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { KanbanSquare, List, Search, X } from 'lucide-react'
import { STATUS_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string }

/**
 * URL-driven filters for the task list (server page reads searchParams).
 * Row 1: scope + view switches, search. Row 2: the dropdown filters.
 */
export function TaskFilters({
  clients, people, departments, showScope, defaultScope = 'mine',
}: { clients: Option[]; people: Option[]; departments: Option[]; showScope: boolean; defaultScope?: 'mine' | 'all' }) {
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
  const scope = params.get('scope') ?? defaultScope
  const filtered = ['q', 'status', 'client', 'assignee', 'dept'].some(k => params.get(k))

  function clearFilters() {
    const next = new URLSearchParams()
    if (params.get('scope')) next.set('scope', params.get('scope')!)
    if (params.get('view')) next.set('view', params.get('view')!)
    setQ('')
    router.push(`${pathname}?${next.toString()}`)
  }

  const toggle = 'inline-flex h-9 items-center rounded-lg bg-slate-100 p-1'
  const select = 'input h-9 w-full py-1.5 pr-8 text-sm sm:w-44'

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showScope && (
          <div className={cn(toggle, 'text-sm')}>
            {[{ v: 'mine', l: 'My tasks' }, { v: 'all', l: 'All tasks' }].map(o => (
              <button key={o.v} onClick={() => set('scope', o.v === defaultScope ? '' : o.v)}
                      className={cn('h-7 rounded-md px-3 font-medium transition', scope === o.v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                {o.l}
              </button>
            ))}
          </div>
        )}
        <div className={toggle}>
          {[{ v: 'list', i: List, l: 'List view' }, { v: 'board', i: KanbanSquare, l: 'Board view' }].map(o => (
            <button key={o.v} onClick={() => set('view', o.v === 'list' ? '' : o.v)} aria-label={o.l} title={o.l}
                    className={cn('flex h-7 w-8 items-center justify-center rounded-md transition', view === o.v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              <o.i className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or GP-1024…" className="input h-9 pl-9" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view !== 'board' && (
          <select className={select} aria-label="Status" value={params.get('status') ?? 'active'} onChange={e => set('status', e.target.value === 'active' ? '' : e.target.value)}>
            <option value="active">Status: not done</option>
            <option value="all">Status: all</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>Status: {s.label.toLowerCase()}</option>)}
          </select>
        )}
        <select className={select} aria-label="Client" value={params.get('client') ?? ''} onChange={e => set('client', e.target.value)}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {showScope && scope === 'all' && (
          <select className={select} aria-label="Assignee" value={params.get('assignee') ?? ''} onChange={e => set('assignee', e.target.value)}>
            <option value="">Any assignee</option>
            <option value="none">Unassigned</option>
            {people.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        )}
        <select className={select} aria-label="Department" value={params.get('dept') ?? ''} onChange={e => set('dept', e.target.value)}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        {filtered && (
          <button onClick={clearFilters} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <X className="h-4 w-4" /> Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
