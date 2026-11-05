'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, KanbanSquare, List, UserRound, UsersRound, X } from 'lucide-react'
import { Avatar } from '@/components/ui/primitives'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { TASK_STATUS_OPTIONS } from '@/lib/constants'
import { TaskSearchField, useTaskSearch } from '@/components/tasks/TaskSearch'
import { cn } from '@/lib/utils'
import type { AppRole } from '@/types/database'

type Option = { value: string; label: string; avatarUrl?: string | null; role?: AppRole }

/**
 * URL-driven task filters and a transient, debounced search.
 */
export function TaskFilters({
  clients, people, departments, showScope, showAssigneeFilter, defaultScope = 'mine', scopeCounts, assigners, action,
}: { clients: Option[]; people: Option[]; departments: Option[]; showScope: boolean; showAssigneeFilter: boolean; defaultScope?: 'mine' | 'all'; scopeCounts: { mine: number; all: number }; assigners: Option[]; action?: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const taskSearch = useTaskSearch()
  const [q, setQ] = useState('')
  const [assigneeOpen, setAssigneeOpen] = useState(false)

  useEffect(() => {
    if (!params.has('q')) return
    const next = new URLSearchParams(params.toString())
    next.delete('q')
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [params, pathname, router])

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.delete('q')
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`${pathname}?${next.toString()}`)
  }

  useEffect(() => {
    if (!assigneeOpen) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Element && !event.target.closest('[data-assignee-filter]')) setAssigneeOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAssigneeOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [assigneeOpen])

  const view = params.get('view') ?? 'list'
  const scope = params.get('scope') ?? defaultScope
  const filtered = Boolean(q || taskSearch.query) || ['status', 'client', 'assignee', 'assigned_by', 'dept', 'due'].some(k => params.get(k))

  function clearFilters() {
    const next = new URLSearchParams()
    if (params.get('scope')) next.set('scope', params.get('scope')!)
    if (params.get('view')) next.set('view', params.get('view')!)
    taskSearch.setQuery('')
    setQ('')
    router.push(`${pathname}?${next.toString()}`)
  }

  function setScope(value: 'mine' | 'all') {
    const next = new URLSearchParams(params.toString())
    next.delete('q')
    next.delete(value === 'mine' ? 'assignee' : 'assigned_by')
    if (value === defaultScope) next.delete('scope')
    else next.set('scope', value)
    router.push(`${pathname}?${next.toString()}`)
  }

  const toggle = 'inline-flex h-9 items-center rounded-lg bg-slate-100 p-1'
  const scopeToggle = 'inline-grid h-9 grid-cols-2 gap-px rounded-xl border border-slate-200 bg-white p-0.5 shadow-card'
  const select = 'input h-9 w-full py-1.5 pr-8 text-sm sm:w-44'
  const scopeOptions = [
    { v: 'mine', l: 'My tasks', i: UserRound },
    { v: 'all', l: 'All tasks', i: UsersRound },
  ] as const

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showScope && (
          <div className={scopeToggle}>
            {scopeOptions.map(o => (
              <button key={o.v} onClick={() => setScope(o.v)}
                      className={cn(
                        'relative flex h-full min-w-0 items-center gap-2 rounded-lg px-3 pr-7 text-xs transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
                        scope === o.v
                          ? 'bg-brand-700 font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
                          : 'bg-white font-medium text-slate-800',
                      )}>
                <o.i aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', scope === o.v ? 'text-white' : 'text-slate-800')} />
                <span className="min-w-0 truncate">{o.l}</span>
                <span className={cn(
                  'absolute right-1 top-1/2 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none shadow-sm',
                  scopeCounts[o.v] > 0 ? 'bg-lime-500 text-white' : 'bg-slate-200 text-[#0F172A]',
                )}>
                  {scopeCounts[o.v] > 99 ? '99+' : scopeCounts[o.v]}
                </span>
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
        {action && <div className="ml-auto">{action}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view !== 'board' && (
          <SearchableSelect className={select} aria-label="Status" value={params.get('status') ?? 'all'} onChange={e => set('status', e.target.value === 'all' ? '' : e.target.value)}>
            <option value="active">Not done</option>
            <option value="all">All statuses</option>
            {TASK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SearchableSelect>
        )}
        <SearchableSelect className={select} aria-label="Client" searchable searchPlaceholder="Search clients..." value={params.get('client') ?? ''} onChange={e => set('client', e.target.value)}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </SearchableSelect>
        {(scope === 'mine' || (showAssigneeFilter && scope === 'all')) && (
          <div className="relative w-full sm:w-44" data-assignee-filter>
            <button type="button" className="input flex h-9 w-full items-center justify-between gap-2 py-1.5 pr-3 text-left text-sm"
                    aria-label={scope === 'mine' ? 'Assigned by' : 'Assignee'} aria-haspopup="listbox" aria-expanded={assigneeOpen}
                    onClick={() => setAssigneeOpen(current => !current)}>
              <span className="truncate">
                {scope === 'mine'
                  ? params.get('assigned_by') === 'none'
                    ? 'Unknown assigner'
                    : assigners.find(person => person.value === params.get('assigned_by'))?.label ?? 'Assigned by'
                  : params.get('assignee') === 'none'
                    ? 'Unassigned'
                    : people.find(person => person.value === params.get('assignee'))?.label ?? 'Any assignee'}
              </span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
            </button>
            {assigneeOpen && (
              <div role="listbox" aria-label={scope === 'mine' ? 'Assigned by' : 'Assignee'} className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full min-w-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {[
                  { value: '', label: scope === 'mine' ? 'Assigned by' : 'Any assignee' },
                  { value: 'none', label: scope === 'mine' ? 'Unknown assigner' : 'Unassigned' },
                  ...(scope === 'mine' ? assigners : people),
                ].map(person => {
                  const filterKey = scope === 'mine' ? 'assigned_by' : 'assignee'
                  const selected = (params.get(filterKey) ?? '') === person.value
                  return (
                    <button key={person.value || 'any'} type="button" role="option" aria-selected={selected}
                            onClick={() => { set(filterKey, person.value); setAssigneeOpen(false) }}
                            className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors', selected ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-[#f3f5f4]')}>
                      {person.value && person.value !== 'none' && <Avatar name={person.label} src={person.avatarUrl} role={person.role} size="sm" />}
                      <span className="truncate">{person.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <SearchableSelect className={select} aria-label="Department" searchable searchPlaceholder="Search departments..." value={params.get('dept') ?? ''} onChange={e => set('dept', e.target.value)}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </SearchableSelect>
        <input
          type="date"
          aria-label="Filter by due date"
          title="Filter by due date"
          value={params.get('due') ?? ''}
          onChange={e => set('due', e.target.value)}
          className="input h-9 w-full py-1.5 text-sm sm:w-44"
        />
        {filtered && (
          <button onClick={clearFilters} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <X className="h-4 w-4" /> Clear filters
          </button>
        )}
        <div className="ml-auto w-full sm:w-72">
          <TaskSearchField value={q} onValueChange={setQ} />
        </div>
      </div>
    </div>
  )
}
