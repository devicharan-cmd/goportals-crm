'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

export function DebouncedSearchInput({
  placeholder,
  className = '',
  inputClassName = '',
  ariaLabel = 'Search',
  delay = 350,
  autoFocus = false,
  value: controlledValue,
  onValueChange,
  onSearch,
}: {
  placeholder: string
  className?: string
  inputClassName?: string
  ariaLabel?: string
  delay?: number
  autoFocus?: boolean
  value?: string
  onValueChange?: (value: string) => void
  onSearch: (value: string) => void
}) {
  const [internalValue, setInternalValue] = useState('')
  const value = controlledValue ?? internalValue

  useEffect(() => {
    const timeout = setTimeout(() => onSearch(value.trim()), delay)
    return () => clearTimeout(timeout)
  }, [delay, onSearch, value])

  return (
    <div className={`relative ${className}`}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        autoComplete="off"
        value={value}
        onChange={event => {
          if (controlledValue === undefined) setInternalValue(event.target.value)
          onValueChange?.(event.target.value)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') event.preventDefault()
        }}
        placeholder={placeholder}
        className={`input h-9 pl-9 ${inputClassName}`}
      />
    </div>
  )
}
