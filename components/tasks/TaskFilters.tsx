'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { KanbanSquare, List, UserRound, UsersRound, X } from 'lucide-react'
import { CompanyAvatar } from '@/components/ui/primitives'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { AssigneeOptionContent } from '@/components/tasks/AssigneeOptionContent'
import { ROLE_LABELS, TASK_STATUS_OPTIONS } from '@/lib/constants'
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

  const view = params.get('view') ?? 'board'
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
    if (value === 'mine') next.delete('assignee')
    if (value === defaultScope) next.delete('scope')
    else next.set('scope', value)
    router.push(`${pathname}?${next.toString()}`)
  }

  const toggle = 'inline-flex h-9 items-center rounded-lg bg-slate-100 p-1'
  const scopeToggle = 'inline-grid h-9 grid-cols-2 gap-px rounded-xl border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]'
  const select = 'task-filter-select h-9 w-full rounded-lg px-2.5 pr-2 py-1'
  const standardSelect = `${select} sm:w-32`
  const clientSelect = `${select} sm:w-40`
  const staffSelect = `${select} sm:w-40`
  const staffOptions = (label: string, staff: Option[]) => [
    { value: '', text: label, label, selectedLabel: label },
    ...staff.map(person => ({
      value: person.value,
      text: `${person.label} ${person.role ? ROLE_LABELS[person.role] : ''}`,
      label: (
        <AssigneeOptionContent
          name={person.label}
          avatarUrl={person.avatarUrl}
          avatarRole={person.role}
          roleLabel={person.role ? ROLE_LABELS[person.role] : undefined}
        />
      ),
      selectedLabel: person.label,
    })),
  ]
  const assigneeOptions = staffOptions(
    'Any assignee',
    people.filter(person =>
      person.value !== 'none'
      && person.value !== 'unassigned'
      && person.label.trim().toLowerCase() !== 'unassigned',
    ),
  )
  const clientOptions = [
    { value: '', text: 'All clients', label: 'All clients' },
    ...clients.map(client => ({
      value: client.value,
      text: client.label,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <CompanyAvatar name={client.label} src={client.avatarUrl} size="sm" className="h-7 w-7 text-[10px]" />
          <span className="break-words text-sm leading-4">{client.label}</span>
        </span>
      ),
      selectedLabel: client.label,
    })),
  ]
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
                          ? 'bg-[#034C68] font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
                          : 'bg-white font-medium text-slate-800',
                      )}>
                <o.i aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', scope === o.v ? 'text-white' : 'text-slate-800')} />
                <span className="min-w-0 truncate">{o.l}</span>
                <span className={cn(
                  'absolute right-1 top-1/2 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none shadow-sm',
                  scopeCounts[o.v] > 0 ? 'bg-[#95C12C] text-white' : 'bg-slate-200 text-[#0F172A]',
                )}>
                  {scopeCounts[o.v] > 99 ? '99+' : scopeCounts[o.v]}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className={toggle}>
          {[{ v: 'board', i: KanbanSquare, l: 'Board view' }, { v: 'list', i: List, l: 'List view' }].map(o => (
            <button key={o.v} onClick={() => set('view', o.v === 'board' ? '' : o.v)} aria-label={o.l} title={o.l}
                    className={cn('flex h-7 w-8 items-center justify-center rounded-md transition', view === o.v ? 'bg-white text-[#034C68] shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              <o.i className="h-4 w-4" />
            </button>
          ))}
        </div>
        {action && <div className="ml-auto">{action}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-nowrap">
          {view !== 'board' && (
            <div className="w-full sm:w-32">
              <SearchableSelect compactOptions className={standardSelect} aria-label="Status" value={params.get('status') ?? 'all'} onChange={e => set('status', e.target.value === 'all' ? '' : e.target.value)}>
                <option value="active">Not done</option>
                <option value="all">All statuses</option>
                {TASK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SearchableSelect>
            </div>
          )}
          <div className="w-full sm:w-40">
            <SearchableSelect
              className={clientSelect}
              aria-label="Client"
              searchable
              compactOptions
              searchPlaceholder="Search clients..."
              dropdownMinWidth={220}
              dropdownMaxHeight={240}
              value={params.get('client') ?? ''}
              options={clientOptions}
              onChange={event => set('client', event.target.value)}
            />
          </div>
          {showAssigneeFilter && scope === 'all' && (
            <div className="w-full sm:w-40">
              <SearchableSelect
                className={staffSelect}
                aria-label="Assignee"
                searchable
                searchPlaceholder="Search assignees..."
                dropdownMinWidth={220}
                dropdownMaxHeight={240}
                dropdownHeading="Assigned to"
                value={params.get('assignee') ?? ''}
                options={assigneeOptions}
                onChange={event => set('assignee', event.target.value)}
              />
            </div>
          )}
          <div className="w-full sm:w-40">
            <SearchableSelect
              className={staffSelect}
              aria-label="Assigned by"
              searchable
              searchPlaceholder="Search assigners..."
              dropdownMinWidth={220}
              dropdownMaxHeight={240}
              dropdownHeading="Assigned by"
              value={params.get('assigned_by') ?? ''}
              options={staffOptions('Any assigner', assigners)}
              onChange={event => set('assigned_by', event.target.value)}
            />
          </div>
          <div className="w-full sm:w-32">
            <SearchableSelect compactOptions className={standardSelect} aria-label="Department" searchable searchPlaceholder="Search departments..." value={params.get('dept') ?? ''} onChange={e => set('dept', e.target.value)}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </SearchableSelect>
          </div>
          <div className="w-full sm:w-36">
            <input
              type="date"
              aria-label="Filter by due date"
              title="Filter by due date"
              value={params.get('due') ?? ''}
              onChange={e => set('due', e.target.value)}
              className="form-field task-filter-select h-9 w-full rounded-lg px-2.5 py-1"
            />
          </div>
          {filtered && (
            <button onClick={clearFilters} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <X className="h-4 w-4" /> Clear filters
            </button>
          )}
        </div>
        <div className="ml-auto w-60 shrink-0">
          <TaskSearchField value={q} onValueChange={setQ} />
        </div>
      </div>
    </div>
  )
}
