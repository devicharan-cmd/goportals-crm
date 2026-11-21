'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  describedBy?: string
  label: string
  className?: string
  buttonClassName?: string
  onBlur?: () => void
}

export function TaskDatePicker({ id, value, onChange, disabled, invalid, describedBy, label, className, buttonClassName, onBlur }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => startOfMonth(value ? new Date(`${value}T12:00:00`) : new Date()))
  const [above, setAbove] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  const selectedYearRef = useRef<HTMLButtonElement>(null)
  const currentYear = new Date().getFullYear()
  const firstYear = Math.min(currentYear, month.getFullYear()) - 20
  const lastYear = Math.max(currentYear, month.getFullYear()) + 20
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index)
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) })
  const selectedDate = value ? new Date(`${value}T12:00:00`) : null

  useEffect(() => {
    if (!open) {
      setYearPickerOpen(false)
      return
    }
    const updatePlacement = () => {
      const bounds = rootRef.current?.getBoundingClientRect()
      if (!bounds) return
      setAbove(window.innerHeight - bounds.bottom < 340 && bounds.top > 320)
      setAlignRight(bounds.left + 288 > window.innerWidth - 8)
    }
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    updatePlacement()
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [open])

  useEffect(() => {
    if (yearPickerOpen) selectedYearRef.current?.scrollIntoView({ block: 'nearest' })
  }, [yearPickerOpen])

  function chooseDate(date: Date) {
    onChange(format(date, 'yyyy-MM-dd'))
    setOpen(false)
    onBlur?.()
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={value ? `${label}: ${format(selectedDate!, 'dd MMM yyyy')}` : label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-describedby={describedBy}
        onClick={() => {
          if (!open) setMonth(startOfMonth(selectedDate ?? new Date()))
          setOpen(current => !current)
        }}
        className={cn(
          'form-field flex h-8 w-full items-center gap-2 py-1 text-left text-sm',
          invalid && 'border-red-400 bg-red-50/40 focus:border-red-500',
          buttonClassName,
        )}
      >
        <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-[#045E80]" />
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-slate-500')}>
          {value ? format(selectedDate!, 'dd-MM-yyyy') : 'dd-mm-yyyy'}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div id={dialogId} role="dialog" aria-label={`Choose ${label.toLowerCase()}`} className={cn('absolute z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-slate-900/5', alignRight ? 'right-0' : 'left-0', above ? 'bottom-full mb-2' : 'top-full mt-2')}>
          <div className="mb-2 flex items-center justify-between gap-1">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(current => subMonths(current, 1))} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#045E80] text-white transition hover:bg-[#034C68]">
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="relative flex min-w-0 items-center gap-1">
              <label className="sr-only" htmlFor={`${id}-calendar-month`}>Calendar month</label>
              <select id={`${id}-calendar-month`} aria-label="Calendar month" value={month.getMonth()} onChange={event => setMonth(current => new Date(current.getFullYear(), Number(event.target.value), 1))} className="form-field h-8 min-w-0 w-24 rounded-lg px-2 text-xs">
                {Array.from({ length: 12 }, (_, monthIndex) => <option key={monthIndex} value={monthIndex}>{format(new Date(2020, monthIndex, 1), 'MMMM')}</option>)}
              </select>
              <button type="button" aria-label="Calendar year" aria-haspopup="listbox" aria-expanded={yearPickerOpen} onClick={() => setYearPickerOpen(current => !current)} className="form-field flex h-8 w-16 shrink-0 items-center justify-between rounded-lg px-2 text-xs">
                {month.getFullYear()}<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />
              </button>
              {yearPickerOpen && (
                <div role="listbox" aria-label="Calendar year" className="absolute right-0 top-9 z-20 max-h-36 w-20 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {years.map(year => (
                    <button key={year} ref={year === month.getFullYear() ? selectedYearRef : undefined} type="button" role="option" aria-selected={year === month.getFullYear()}
                      onClick={() => { setMonth(current => new Date(year, current.getMonth(), 1)); setYearPickerOpen(false) }}
                      className={cn('w-full rounded-md px-2 py-1 text-left text-xs transition-colors', year === month.getFullYear() ? 'bg-[#EAF4F8] font-semibold text-[#034C68]' : 'text-slate-700 hover:bg-slate-50')}>
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" aria-label="Next month" onClick={() => setMonth(current => addMonths(current, 1))} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#045E80] text-white transition hover:bg-[#034C68]">
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500" aria-hidden="true">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map(day => {
              const selected = selectedDate ? isSameDay(day, selectedDate) : false
              const inMonth = isSameMonth(day, month)
              const today = isToday(day)
              return (
                <button
                  key={format(day, 'yyyy-MM-dd')}
                  type="button"
                  aria-label={format(day, 'EEEE, d MMMM yyyy')}
                  aria-pressed={selected}
                  onClick={() => chooseDate(day)}
                  className={cn(
                    'mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors',
                    selected ? 'bg-[#045E80] font-semibold text-white' : today ? 'font-semibold text-[#045E80] ring-1 ring-inset ring-[#045E80]/40 hover:bg-[#EAF4F8]' : inMonth ? 'text-slate-700 hover:bg-[#EAF4F8] hover:text-[#034C68]' : 'text-slate-300 hover:bg-slate-50',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button type="button" disabled={!value} onClick={() => { onChange(''); setOpen(false); onBlur?.() }} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Clear</button>
            <button type="button" onClick={() => chooseDate(new Date())} className="rounded-md px-2 py-1 text-xs font-semibold text-[#045E80] transition hover:bg-[#EAF4F8]">Today</button>
          </div>
        </div>
      )}
    </div>
  )
}
