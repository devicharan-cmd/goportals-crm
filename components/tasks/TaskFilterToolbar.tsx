'use client'

import { KanbanSquare, List, Send, UserRound, UsersRound, X } from 'lucide-react'
import { AssigneeOptionContent } from '@/components/tasks/AssigneeOptionContent'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { CompanyAvatar } from '@/components/ui/primitives'
import { ROLE_LABELS, TASK_STATUS_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { AppRole } from '@/types/database'

type Option = { value: string; label: string; avatarUrl?: string | null; role?: AppRole }

export function TaskFilterToolbar({
  scope, onScopeChange, scopeCounts, scopeLoading = false, showScope = true, showAssignedScope = false, view, onViewChange, status, onStatusChange,
  clients = [], client = '', onClientChange, showClientFilter = false,
  people = [], assignee = '', onAssigneeChange, showAssigneeFilter = false,
  assigners = [], assignedBy = '', onAssignedByChange, showAssignedByFilter = false,
  departments, department, onDepartmentChange, due, onDueChange,
  searchInput, onSearchInput, onSearch, filtered, onClearFilters, action,
}: {
  scope: 'mine' | 'assigned' | 'all'
  onScopeChange: (scope: 'mine' | 'assigned' | 'all') => void
  scopeCounts: { mine: number; assigned: number; all: number }
  scopeLoading?: boolean
  showScope?: boolean
  showAssignedScope?: boolean
  view: 'board' | 'list'
  onViewChange: (view: 'board' | 'list') => void
  status: string
  onStatusChange: (status: string) => void
  clients?: Option[]
  client?: string
  onClientChange?: (client: string) => void
  showClientFilter?: boolean
  people?: Option[]
  assignee?: string
  onAssigneeChange?: (assignee: string) => void
  showAssigneeFilter?: boolean
  assigners?: Option[]
  assignedBy?: string
  onAssignedByChange?: (assignedBy: string) => void
  showAssignedByFilter?: boolean
  departments: Option[]
  department: string
  onDepartmentChange: (department: string) => void
  due: string
  onDueChange: (due: string) => void
  searchInput: string
  onSearchInput: (value: string) => void
  onSearch: (value: string) => void
  filtered: boolean
  onClearFilters: () => void
  action?: React.ReactNode
}) {
  const toggle = 'inline-flex h-9 items-center rounded-lg bg-slate-100 p-1'
  const scopeToggle = 'inline-flex h-9 gap-px rounded-xl border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]'
  const select = 'task-filter-select h-9 w-full rounded-lg px-2.5 pr-2 py-1'
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
  const clientOptions = [
    { value: '', text: 'All clients', label: 'All clients' },
    ...clients.map(option => ({
      value: option.value,
      text: option.label,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <CompanyAvatar name={option.label} src={option.avatarUrl} size="sm" className="h-7 w-7 text-[10px]" />
          <span className="break-words text-sm leading-4">{option.label}</span>
        </span>
      ),
      selectedLabel: option.label,
    })),
  ]

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showScope && <div className={scopeToggle}>
          {([
            { value: 'mine', label: 'My tasks', icon: UserRound },
            { value: 'assigned', label: 'Assigned by me', icon: Send },
            { value: 'all', label: 'All tasks', icon: UsersRound },
          ] as const).filter(option => showAssignedScope || option.value !== 'assigned').map(option => (
            <button
              key={option.value}
              type="button"
              disabled={scopeLoading}
              aria-pressed={scope === option.value}
              onClick={() => onScopeChange(option.value)}
              className={cn(
                'relative flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 pr-6 text-xs transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none disabled:cursor-wait disabled:opacity-70',
                scope === option.value
                  ? 'bg-[#034C68] font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
                  : 'bg-white font-medium text-slate-800',
              )}
            >
              <option.icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', scope === option.value ? 'text-white' : 'text-slate-800')} />
              <span>{option.label}</span>
              <span className={cn(
                'absolute right-1 top-1/2 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none shadow-sm',
                (scopeCounts[option.value] ?? 0) > 0 ? 'bg-[#95C12C] text-white' : 'bg-slate-200 text-[#0F172A]',
              )}>
                {(scopeCounts[option.value] ?? 0) > 99 ? '99+' : scopeCounts[option.value] ?? 0}
              </span>
            </button>
          ))}
        </div>}
        <div className={toggle}>
          {([
            { value: 'board', icon: KanbanSquare, label: 'Board view' },
            { value: 'list', icon: List, label: 'List view' },
          ] as const).map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onViewChange(option.value)}
              aria-label={option.label}
              title={option.label}
              className={cn(
                'flex h-7 w-8 items-center justify-center rounded-md transition',
                view === option.value ? 'bg-white text-[#034C68] shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <option.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        {action && <div className="ml-auto">{action}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-nowrap">
          {view === 'list' && (
            <div className="w-full sm:w-32">
              <SearchableSelect
                compactOptions
                className={`${select} sm:w-32`}
                aria-label="Status"
                value={status}
                onChange={event => onStatusChange(event.target.value)}
              >
                <option value="active">Not done</option>
                <option value="all">All statuses</option>
                {TASK_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SearchableSelect>
            </div>
          )}
          {showClientFilter && onClientChange && (
            <div className="w-full sm:w-40">
              <SearchableSelect
                className={`${select} sm:w-40`}
                aria-label="Client"
                searchable
                compactOptions
                searchPlaceholder="Search clients..."
                dropdownMinWidth={220}
                dropdownMaxHeight={240}
                value={client}
                options={clientOptions}
                onChange={event => onClientChange(event.target.value)}
              />
            </div>
          )}
          {showAssigneeFilter && scope === 'all' && onAssigneeChange && (
            <div className="w-full sm:w-40">
              <SearchableSelect
                className={`${select} sm:w-40`}
                aria-label="Assignee"
                searchable
                denseOptions
                searchPlaceholder="Search assignees..."
                dropdownMinWidth={220}
                dropdownMaxHeight={240}
                dropdownHeading="Assigned to"
                value={assignee}
                options={staffOptions('Any assignee', people.filter(person =>
                  person.value !== 'none'
                  && person.value !== 'unassigned'
                  && person.label.trim().toLowerCase() !== 'unassigned',
                ))}
                onChange={event => onAssigneeChange(event.target.value)}
              />
            </div>
          )}
          {showAssignedByFilter && scope === 'all' && onAssignedByChange && (
            <div className="w-full sm:w-40">
              <SearchableSelect
                className={`${select} sm:w-40`}
                aria-label="Assigned by"
                searchable
                denseOptions
                searchPlaceholder="Search assigners..."
                dropdownMinWidth={220}
                dropdownMaxHeight={240}
                dropdownHeading="Assigned by"
                value={assignedBy}
                options={staffOptions('Any assigner', assigners)}
                onChange={event => onAssignedByChange(event.target.value)}
              />
            </div>
          )}
          <div className="w-full sm:w-32">
            <SearchableSelect
              compactOptions
              className={`${select} sm:w-32`}
              aria-label="Department"
              searchable
              searchPlaceholder="Search departments..."
              value={department}
              onChange={event => onDepartmentChange(event.target.value)}
            >
              <option value="">All departments</option>
              {departments.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SearchableSelect>
          </div>
          <div className="w-full sm:w-36">
            <input
              type="date"
              aria-label="Filter by due date"
              title="Filter by due date"
              value={due}
              onChange={event => onDueChange(event.target.value)}
              className="form-field task-filter-select h-9 w-full rounded-lg px-2.5 py-1"
            />
          </div>
          {filtered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" /> Clear filters
            </button>
          )}
        </div>
        <div className="ml-auto w-full shrink-0 sm:w-60">
          <DebouncedSearchInput
            placeholder="Search title or GP-1024…"
            className="w-full"
            ariaLabel="Search tasks"
            value={searchInput}
            onValueChange={onSearchInput}
            onSearch={onSearch}
          />
        </div>
      </div>
    </div>
  )
}
