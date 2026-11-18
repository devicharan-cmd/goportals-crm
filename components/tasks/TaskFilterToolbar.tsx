'use client'

import { useEffect, useRef, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, KanbanSquare, List, Send, UserRound, UsersRound, X } from 'lucide-react'
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
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(due ? new Date(`${due}T00:00:00`) : new Date()))
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const selectedYearRef = useRef<HTMLButtonElement | null>(null)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: Math.max(1, currentYear - 1999) }, (_, index) => currentYear - index)
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(calendarMonth)),
    end: endOfWeek(endOfMonth(calendarMonth)),
  })

  useEffect(() => {
    if (!calendarOpen) {
      setYearPickerOpen(false)
      return
    }
    function closeCalendar(event: PointerEvent) {
      if (event.target instanceof Node && !calendarRef.current?.contains(event.target)) setCalendarOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCalendarOpen(false)
    }
    document.addEventListener('pointerdown', closeCalendar)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', closeCalendar)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [calendarOpen])

  useEffect(() => {
    if (due) setCalendarMonth(startOfMonth(new Date(`${due}T00:00:00`)))
  }, [due])

  useEffect(() => {
    if (yearPickerOpen) selectedYearRef.current?.scrollIntoView({ block: 'nearest' })
  }, [yearPickerOpen])

  const toggle = 'inline-flex h-9 items-center rounded-lg bg-slate-100 p-1'
  const scopeToggle = 'inline-flex h-9 gap-px rounded-xl border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]'
  const select = 'task-filter-select h-9 w-full rounded-lg px-2.5 pr-2 py-1 !text-xs'
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
          compact
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
          <CompanyAvatar name={option.label} src={option.avatarUrl} size="sm" className="h-5 w-5 text-[10px]" />
          <span className="truncate text-xs leading-4">{option.label}</span>
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
                'absolute right-1 top-1/2 inline-grid h-4 min-w-4 -translate-y-1/2 place-items-center rounded-full px-1 text-center text-[10px] font-semibold leading-4 tabular-nums',
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

      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap lg:flex-nowrap">
        <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-wrap sm:items-center sm:gap-2 lg:flex-nowrap">
          {view === 'list' && (
            <div className="min-w-0 sm:w-32">
              <SearchableSelect
                compactOptions
                optionTextClassName="!text-xs"
                searchInputClassName="!h-8 !text-xs"
                dropdownMinWidth={190}
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
            <div className="min-w-0 sm:w-40">
              <SearchableSelect
                optionTextClassName="!text-xs"
                searchInputClassName="!h-8 !text-xs"
                className={`${select} sm:w-40`}
                aria-label="Client"
                searchable
                compactOptions
                searchPlaceholder="Search clients..."
                dropdownMinWidth={190}
                dropdownMaxHeight={240}
                value={client}
                options={clientOptions}
                onChange={event => onClientChange(event.target.value)}
              />
            </div>
          )}
          {showAssigneeFilter && scope === 'all' && onAssigneeChange && (
            <div className="min-w-0 sm:w-40">
              <SearchableSelect
                optionTextClassName="!text-xs"
                searchInputClassName="!h-8 !text-xs"
                className={`${select} sm:w-40`}
                aria-label="Assignee"
                searchable
                denseOptions
                searchPlaceholder="Search assignees..."
                dropdownMinWidth={190}
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
            <div className="min-w-0 sm:w-40">
              <SearchableSelect
                optionTextClassName="!text-xs"
                searchInputClassName="!h-8 !text-xs"
                className={`${select} sm:w-40`}
                aria-label="Assigned by"
                searchable
                denseOptions
                searchPlaceholder="Search assigners..."
                dropdownMinWidth={190}
                dropdownMaxHeight={240}
                dropdownHeading="Assigned by"
                value={assignedBy}
                options={staffOptions('Any assigner', assigners)}
                onChange={event => onAssignedByChange(event.target.value)}
              />
            </div>
          )}
          <div className="min-w-0 sm:w-32">
            <SearchableSelect
              compactOptions
              optionTextClassName="!text-xs"
              searchInputClassName="!h-8 !text-xs"
              dropdownMinWidth={190}
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
          <div className="min-w-0 sm:w-36">
            <div className="relative" ref={calendarRef}>
              <button
                type="button"
                aria-label={due ? `Filter by due date: ${format(new Date(`${due}T00:00:00`), 'dd MMM yyyy')}` : 'Filter by due date'}
                aria-haspopup="dialog"
                aria-expanded={calendarOpen}
                onClick={() => setCalendarOpen(open => !open)}
                className="form-field task-filter-select flex h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left !text-xs"
              >
                <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-[#045E80]" />
                <span className={cn('min-w-0 flex-1 truncate', !due && 'text-slate-500')}>{due ? format(new Date(`${due}T00:00:00`), 'dd MMM yyyy') : 'dd-mm-yyyy'}</span>
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              </button>
              {calendarOpen && (
                <div role="dialog" aria-label="Choose due date" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5">
                  <div className="mb-2 flex items-center justify-between gap-1.5">
                    <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(month => subMonths(month, 1))} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#045E80] text-white transition hover:bg-[#034C68]">
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <div className="relative flex min-w-0 items-center gap-1.5">
                      <label className="sr-only" htmlFor="task-due-filter-month">Calendar month</label>
                      <select id="task-due-filter-month" aria-label="Calendar month" value={calendarMonth.getMonth()} onChange={event => setCalendarMonth(month => new Date(month.getFullYear(), Number(event.target.value), 1))} className="form-field h-8 min-w-0 w-32 rounded-lg px-2 text-xs">
                        {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{format(new Date(2020, month, 1), 'MMMM')}</option>)}
                      </select>
                      <button type="button" aria-label="Calendar year" aria-haspopup="listbox" aria-expanded={yearPickerOpen} onClick={() => setYearPickerOpen(open => !open)} className="form-field flex h-8 w-20 items-center justify-between rounded-lg px-2 text-xs">
                        {calendarMonth.getFullYear()}<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />
                      </button>
                      {yearPickerOpen && (
                        <div role="listbox" aria-label="Calendar year" className="absolute right-0 top-9 z-20 max-h-36 w-20 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                          {years.map(year => (
                            <button
                              key={year}
                              ref={year === calendarMonth.getFullYear() ? selectedYearRef : undefined}
                              type="button"
                              role="option"
                              aria-selected={year === calendarMonth.getFullYear()}
                              onClick={() => {
                                setCalendarMonth(month => new Date(year, month.getMonth(), 1))
                                setYearPickerOpen(false)
                              }}
                              className={cn('w-full rounded-md px-2 py-1 text-left text-xs transition-colors', year === calendarMonth.getFullYear() ? 'bg-[#EAF4F8] font-semibold text-[#034C68]' : 'text-slate-700 hover:bg-slate-50')}
                            >
                              {year}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" aria-label="Next month" onClick={() => setCalendarMonth(month => addMonths(month, 1))} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#045E80] text-white transition hover:bg-[#034C68]">
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden="true">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}
                  </div>
                  <div className="grid grid-cols-7 gap-y-1">
                    {calendarDays.map(day => {
                      const selected = due ? isSameDay(day, new Date(`${due}T00:00:00`)) : false
                      const inMonth = isSameMonth(day, calendarMonth)
                      const today = isToday(day)
                      return (
                        <button key={format(day, 'yyyy-MM-dd')} type="button" aria-label={format(day, 'EEEE, d MMMM yyyy')} aria-pressed={selected} onClick={() => { onDueChange(format(day, 'yyyy-MM-dd')); setCalendarOpen(false) }} className={cn('mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors', selected ? 'bg-[#045E80] font-semibold text-white shadow-sm' : today ? 'font-semibold text-[#045E80] ring-1 ring-inset ring-[#045E80]/40 hover:bg-[#EAF4F8]' : inMonth ? 'text-slate-700 hover:bg-[#EAF4F8] hover:text-[#034C68]' : 'text-slate-300 hover:bg-slate-50')}>
                          {format(day, 'd')}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                    <button type="button" disabled={!due} onClick={() => { onDueChange(''); setCalendarOpen(false) }} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Clear</button>
                    <button type="button" onClick={() => { const today = new Date(); onDueChange(format(today, 'yyyy-MM-dd')); setCalendarMonth(startOfMonth(today)); setCalendarOpen(false) }} className="rounded-md px-2 py-1 text-xs font-semibold text-[#045E80] transition hover:bg-[#EAF4F8]">Today</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {filtered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="col-span-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" /> Clear filters
            </button>
          )}
        </div>
        <div className="col-span-2 w-full shrink-0 sm:ml-auto sm:w-60">
          <DebouncedSearchInput
            placeholder="Search title or GP-1024…"
            className="w-full"
            inputClassName="w-full !text-xs"
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
