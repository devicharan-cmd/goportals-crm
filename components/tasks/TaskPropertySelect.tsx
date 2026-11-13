'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TaskPropertySelect({
  label, value, options, disabled = false, onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.value === value)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className="form-field flex h-9 w-full items-center justify-between gap-2 pl-3 pr-4 text-left text-sm disabled:cursor-wait disabled:opacity-60"
      >
        <span className="min-w-0 truncate">{selected?.label ?? value}</span>
        <ChevronDown aria-hidden="true" className="mr-0.5 h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-40 mt-1 max-h-64 w-full space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {options.map(option => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setOpen(false)
                  if (!isSelected) onChange(option.value)
                }}
                className={cn(
                  'w-full whitespace-normal rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  isSelected ? 'bg-[#EAF4F8] font-medium text-[#034C68]' : 'text-slate-700 hover:bg-[#f3f5f4]',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
