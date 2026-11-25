'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

type TaskDateFieldProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  readOnly?: boolean
}

export function TaskDateField({ value, onChange, disabled = false, readOnly = false }: TaskDateFieldProps) {
  const dayRef = useRef<HTMLInputElement | null>(null)
  const monthRef = useRef<HTMLInputElement | null>(null)
  const yearRef = useRef<HTMLInputElement | null>(null)
  const digits = value.replace(/\D/g, '').slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
  const refs = [dayRef, monthRef, yearRef]
  const limits = [2, 2, 4]

  const updatePart = (part: number, next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, limits[part])
    const nextParts = [...parts]
    nextParts[part] = clean
    onChange(nextParts.join(''))
    if (clean.length === limits[part] && part < 2) {
      requestAnimationFrame(() => refs[part + 1].current?.focus())
    }
  }

  return (
    <div className={cn('form-field flex h-9 w-full items-center rounded-lg px-2.5 text-xs', disabled && 'bg-slate-50')}>
      {parts.map((part, index) => (
        <span key={index} className="flex min-w-0 items-center">
          <input
            ref={refs[index]}
            value={part}
            disabled={disabled}
            readOnly={readOnly}
            inputMode="numeric"
            maxLength={limits[index]}
            placeholder={index === 0 ? 'dd' : index === 1 ? 'mm' : 'yyyy'}
            aria-label={index === 0 ? 'Day' : index === 1 ? 'Month' : 'Year'}
            spellCheck={false}
            onChange={event => updatePart(index, event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Backspace' && !part && index > 0) {
                event.preventDefault()
                refs[index - 1].current?.focus()
                return
              }
              if (event.key === 'ArrowLeft' && !part && index > 0) {
                event.preventDefault()
                refs[index - 1].current?.focus()
              }
              if (event.key === 'ArrowRight' && part.length === limits[index] && index < 2) {
                event.preventDefault()
                refs[index + 1].current?.focus()
              }
            }}
            className="min-w-0 flex-none border-0 bg-transparent p-0 text-xs text-slate-700 outline-none placeholder:text-slate-400"
            style={{ width: index === 2 ? '2.25rem' : '1.15rem' }}
          />
          {index < 2 && <span aria-hidden="true" className="text-slate-700">/</span>}
        </span>
      ))}
    </div>
  )
}
