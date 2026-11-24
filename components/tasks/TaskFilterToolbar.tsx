'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays, format, parse, isValid } from 'date-fns'
import { CalendarDays, ChevronDown, KanbanSquare, List, Send, UserRound, UsersRound, X } from 'lucide-react'
import { AssigneeOptionContent } from '@/components/tasks/AssigneeOptionContent'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { CompanyAvatar } from '@/components/ui/primitives'
import { ROLE_LABELS, TASK_STATUS_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { AppRole } from '@/types/database'

type Option = { value: string; label: string; avatarUrl?: string | null; role?: AppRole }

function dateMask(digits: string) {
  const value = digits.replace(/\D/g, '').slice(0, 8)
  const day = value.slice(0, 2).padEnd(2, 'd')
  const month = value.slice(2, 4).padEnd(2, 'm')
  const year = value.slice(4, 8).padEnd(4, 'y')
  return `${day}/${month}/${year}`
}

function dateDigitsToDisplay(digits: string) {
  return digits.length === 8 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : dateMask(digits)
}

export function TaskFilterToolbar({
  scope, onScopeChange, scopeCounts, scopeLoading = false, showScope = true, showAssignedScope = false, view, onViewChange, status, onStatusChange,
  clients = [], client = '', onClientChange, showClientFilter = false,
  people = [], assignee = '', onAssigneeChange, showAssigneeFilter = false,
  assigners = [], assignedBy = '', onAssignedByChange, showAssignedByFilter = false,
  departments, department, onDepartmentChange, due, dateBy = 'due', onDateByChange, onDueChange, onDateFilterApply, onDateFilterClear,
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
  dateBy?: 'due' | 'assigned'
  onDateByChange?: (dateBy: 'due' | 'assigned') => void
  onDateFilterApply?: (dateBy: 'due' | 'assigned', due: string) => void
  onDateFilterClear?: () => void
  searchInput: string
  onSearchInput: (value: string) => void
  onSearch: (value: string) => void
  filtered: boolean
  onClearFilters: () => void
  action?: React.ReactNode
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarPosition, setCalendarPosition] = useState<{ top: number; left: number } | null>(null)
  const [draftDateBy, setDraftDateBy] = useState<'' | 'due' | 'assigned'>(due ? dateBy : '')
  const [draftRange, setDraftRange] = useState('')
  const [draftDate, setDraftDate] = useState(due ? format(new Date(`${due}T00:00:00`), 'ddMMyyyy') : '')
  const [dateTypeOpen, setDateTypeOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const scopeTabsRef = useRef<HTMLDivElement | null>(null)
  const [scopePill, setScopePill] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  useEffect(() => {
    if (!calendarOpen) {
      setCalendarPosition(null)
      setDateTypeOpen(false)
      return
    }
    const positionCalendar = () => {
      const button = calendarRef.current?.querySelector('button')
      if (!button) return
      const rect = button.getBoundingClientRect()
      const width = Math.min(320, window.innerWidth - 32)
      setCalendarPosition({
        top: rect.bottom + 8,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      })
    }
    positionCalendar()
    window.addEventListener('resize', positionCalendar)
    window.addEventListener('scroll', positionCalendar, true)
    function closeCalendar(event: PointerEvent) {
      if (event.target instanceof Node && !calendarRef.current?.contains(event.target)) setCalendarOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCalendarOpen(false)
    }
    document.addEventListener('pointerdown', closeCalendar)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('resize', positionCalendar)
      window.removeEventListener('scroll', positionCalendar, true)
      document.removeEventListener('pointerdown', closeCalendar)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [calendarOpen])

  useEffect(() => {
    if (!calendarOpen) return
    setDraftDateBy(due ? dateBy : '')
    setDraftRange(due ? 'custom' : '')
    setDraftDate(due ? format(new Date(`${due}T00:00:00`), 'ddMMyyyy') : '')
  }, [calendarOpen, dateBy, due])

  const draftDateDisplay = dateDigitsToDisplay(draftDate)
  const parsedDraftDate = parse(draftDateDisplay, 'dd/MM/yyyy', new Date())
  const validDraftDate = draftDate.length === 8 && isValid(parsedDraftDate) && format(parsedDraftDate, 'dd/MM/yyyy') === draftDateDisplay
  const canApplyDateFilter = Boolean(draftDateBy && draftRange && validDraftDate)

  useLayoutEffect(() => {
    const syncScopePill = () => {
      const tabs = scopeTabsRef.current
      const selected = tabs?.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (!tabs || !selected) return
      setScopePill({ x: selected.offsetLeft, y: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight })
    }
    syncScopePill()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncScopePill)
    if (resizeObserver && scopeTabsRef.current) {
      resizeObserver.observe(scopeTabsRef.current)
      const selected = scopeTabsRef.current.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (selected) resizeObserver.observe(selected)
    }
    window.addEventListener('resize', syncScopePill)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncScopePill)
    }
  }, [scope, showAssignedScope, scopeCounts.mine, scopeCounts.assigned, scopeCounts.all])

  const toggle = 'inline-flex h-9 items-center rounded-lg bg-slate-100 p-1 sm:max-lg:h-8 sm:max-lg:p-0.5 max-sm:h-8 max-sm:p-0.5'
  const scopeToggle = 'relative inline-flex h-9 gap-px rounded-xl border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)] sm:max-lg:h-8 max-sm:h-8 max-sm:min-w-0 max-sm:flex-1 max-sm:rounded-lg'
  const select = 'task-filter-select h-9 w-full rounded-lg px-2.5 pr-2 py-1 !text-xs sm:max-lg:h-8 sm:max-lg:px-2 sm:max-lg:!text-[11px] max-sm:h-8 max-sm:rounded-md max-sm:px-1.5 max-sm:!text-[10px]'
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
    <div className="mb-4 space-y-3 max-sm:mb-2 max-sm:space-y-2">
      <div className="flex flex-wrap items-center gap-2 max-sm:gap-1.5">
        {showScope && <div ref={scopeTabsRef} className={scopeToggle}>
          {scopePill && <span aria-hidden="true" className="task-scope-active-pill" style={{ transform: `translate(${scopePill.x}px, ${scopePill.y}px)`, width: scopePill.width, height: scopePill.height }} />}
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
                'relative z-[1] flex h-full min-w-max shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none disabled:cursor-wait disabled:opacity-70 sm:max-lg:gap-1 sm:max-lg:px-2 sm:max-lg:text-[11px] max-sm:gap-1 max-sm:px-1.5 max-sm:text-[10px]',
                scope === option.value
                  ? 'font-semibold text-white'
                  : 'bg-white font-medium text-slate-800',
              )}
            >
              <option.icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 max-sm:h-3 max-sm:w-3', scope === option.value ? 'text-white' : 'text-slate-800')} />
              <span className="shrink-0">{option.label}</span>
              <span className={cn(
                'ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none tabular-nums',
                (scopeCounts[option.value] ?? 0) > 0 ? 'bg-[#95C12C] text-white' : 'bg-slate-200 text-[#0F172A]',
              )}>
                {scopeCounts[option.value] ?? 0}
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
                'flex h-7 w-8 items-center justify-center rounded-md transition sm:max-lg:h-7 sm:max-lg:w-7 max-sm:h-7 max-sm:w-7',
                view === option.value ? 'bg-white text-[#034C68] shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
                <option.icon className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
            </button>
          ))}
        </div>
        {action && <div className="ml-auto">{action}</div>}
      </div>

      <div className="relative z-30 flex flex-nowrap items-center gap-2 overflow-x-auto sm:flex-wrap lg:flex-nowrap max-sm:overflow-visible max-sm:gap-1 max-sm:pb-1">
        <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-wrap sm:items-center sm:gap-2 lg:flex-nowrap">
          {view === 'list' && (
            <div className="min-w-0 max-sm:w-[72px] sm:w-32 sm:max-lg:w-28">
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
            <div className="min-w-0 max-sm:w-[21vw] max-sm:min-w-[76px] max-sm:max-w-[100px] sm:w-40 sm:max-lg:w-32">
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
            <div className="min-w-0 max-sm:w-[21vw] max-sm:min-w-[76px] max-sm:max-w-[100px] sm:w-40 sm:max-lg:w-32">
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
            <div className="min-w-0 max-sm:w-[21vw] max-sm:min-w-[76px] max-sm:max-w-[100px] sm:w-40 sm:max-lg:w-32">
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
          <div className="min-w-0 max-sm:w-[21vw] max-sm:min-w-[76px] max-sm:max-w-[100px] sm:w-32 sm:max-lg:w-28">
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
          <div className="min-w-0 max-sm:w-[94px] sm:w-32 sm:max-lg:w-28">
            <div className="relative z-40" ref={calendarRef}>
              <button
                type="button"
                aria-label={due ? `Filter by ${dateBy === 'assigned' ? 'assigned' : 'due'} date: ${format(new Date(`${due}T00:00:00`), 'dd MMM yyyy')}` : 'Filter by date'}
                aria-haspopup="dialog"
                aria-expanded={calendarOpen}
                onClick={() => setCalendarOpen(open => !open)}
                className="form-field task-filter-select flex h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left !text-xs text-slate-700 max-sm:h-8 max-sm:gap-1 max-sm:rounded-md max-sm:px-2 max-sm:!text-[10px]"
              >
                <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-[#045E80]" />
                 <span className={cn('min-w-0 flex-1 truncate', !due && 'text-slate-500')}><span className="max-sm:hidden">{due ? format(new Date(`${due}T00:00:00`), 'dd MMM yyyy') : 'Date'}</span><span className="hidden max-sm:inline">{due ? format(new Date(`${due}T00:00:00`), 'dd MMM') : 'Date'}</span></span>
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-500 max-sm:h-3 max-sm:w-3" />
              </button>
              {calendarOpen && calendarPosition && (
                <div role="dialog" aria-label="Choose task date" style={{ position: 'fixed', top: calendarPosition.top, left: calendarPosition.left }} className="fixed z-[100] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl ring-1 ring-black/5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">Date filter</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Choose the field, range, and date</p>
                    </div>
                    <CalendarDays aria-hidden="true" className="h-5 w-5 text-[#045E80]" />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-600">
                      Date type
                      <span className="relative mt-1.5 block">
                        <button type="button" aria-haspopup="listbox" aria-expanded={dateTypeOpen} onClick={() => setDateTypeOpen(open => !open)} className="form-field flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs font-normal">
                          <span className={cn(!draftDateBy && 'text-slate-500')}>{draftDateBy === 'due' ? 'Due date' : draftDateBy === 'assigned' ? 'Assigned date' : 'Select type'}</span>
                          <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500" />
                        </button>
                        {dateTypeOpen && (
                          <div role="listbox" aria-label="Date type" className="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                            {[
                              { value: '', label: 'Select type' },
                              { value: 'due', label: 'Due date' },
                              { value: 'assigned', label: 'Assigned date' },
                            ].map(option => (
                              <button key={option.value || 'empty'} type="button" role="option" aria-selected={draftDateBy === option.value} onClick={() => { setDraftDateBy(option.value as '' | 'due' | 'assigned'); setDateTypeOpen(false) }} className={cn('flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-normal transition-colors', draftDateBy === option.value ? 'bg-[#EAF4F8] text-[#034C68]' : 'text-slate-700 hover:bg-slate-50')}>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </span>
                    </label>
                    <fieldset>
                      <legend className="text-xs font-semibold text-slate-600">Select date range</legend>
                      <div className="mt-1.5 grid grid-cols-4 gap-2 max-sm:grid-cols-2">
                        {[
                          { value: 'today', label: 'Today' },
                          { value: 'tomorrow', label: 'Tomorrow' },
                          { value: 'week', label: 'This week' },
                          { value: 'custom', label: 'Custom date' },
                        ].map(option => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={draftRange === option.value}
                            onClick={() => {
                              setDraftRange(option.value)
                              if (option.value === 'today') setDraftDate(format(new Date(), 'ddMMyyyy'))
                              else if (option.value === 'tomorrow') setDraftDate(format(addDays(new Date(), 1), 'ddMMyyyy'))
                              else if (option.value === 'week') setDraftDate(format(new Date(), 'ddMMyyyy'))
                              else setDraftDate('')
                            }}
                            className={cn(
                              'h-8 rounded-lg border px-1 text-[10px] font-medium transition-colors',
                              draftRange === option.value
                                ? 'border-[#045E80] bg-[#045E80] text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-[#7DB4C7] hover:text-[#034C68]',
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label className="block text-xs font-semibold text-slate-600">
                      Date
                      <input value={draftDateDisplay} disabled={!draftRange} readOnly={draftRange !== 'custom'} onChange={event => setDraftDate(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" aria-label="Date in day month year format" className={cn('form-field mt-1.5 h-9 w-full rounded-lg px-2.5 text-xs font-normal', (!draftRange || draftRange !== 'custom') && 'bg-slate-50 text-slate-600')} />
                    </label>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button type="button" disabled={!due} onClick={() => { onDateFilterClear?.(); setCalendarOpen(false) }} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Clear</button>
                    <button type="button" disabled={!canApplyDateFilter} onClick={() => { const iso = format(parsedDraftDate, 'yyyy-MM-dd'); (onDateFilterApply ? onDateFilterApply(draftDateBy as 'due' | 'assigned', iso) : (onDateByChange?.(draftDateBy as 'due' | 'assigned'), onDueChange(iso))); setCalendarOpen(false) }} className="rounded-lg bg-[#045E80] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#034C68] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">Apply</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {filtered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 max-sm:h-8 max-sm:px-1.5 max-sm:text-[10px]"
            >
              <X className="h-4 w-4" /> Clear filters
            </button>
          )}
        </div>
        <div className="w-full shrink-0 max-sm:w-[min(28vw,124px)] max-sm:min-w-[104px] sm:ml-auto sm:w-60 sm:max-lg:w-44">
          <DebouncedSearchInput
            placeholder="Search title or GP-1024…"
            className="w-full"
            inputClassName="w-full !text-xs max-sm:h-8 max-sm:pl-7 max-sm:pr-1.5 max-sm:!text-[10px]"
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
