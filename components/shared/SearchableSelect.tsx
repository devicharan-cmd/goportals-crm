'use client'

import { Children, isValidElement, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean }
type SelectOption = { value: string; label: string; disabled: boolean }
type DisplayOption = SelectOption & { content?: ReactNode; selectedContent?: ReactNode }
type SelectValueChangeEvent = { target: { value: string }; currentTarget: { value: string } }
type DropdownPosition = { left: number; top: number; width: number; maxHeight: number; openBelow: boolean }
type RichSelectOption = { value: string; label: ReactNode; text: string; selectedLabel?: ReactNode; disabled?: boolean }

function optionLabel(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    return ''
  }).join('')
}

function getOptions(children: ReactNode): SelectOption[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<OptionProps>(child) || child.type !== 'option') return []
    const label = optionLabel(child.props.children)
    return [{
      value: String(child.props.value ?? label),
      label,
      disabled: !!child.props.disabled,
    }]
  })
}

export function SearchableSelect({
  children,
  value: controlledValue,
  defaultValue,
  onChange,
  name,
  className,
  placeholder,
  searchable = false,
  searchPlaceholder = 'Search options...',
  emptyMessage = 'No options found.',
  disabled = false,
  required = false,
  id,
  options: richOptions,
  dropdownMinWidth,
  dropdownMaxHeight = 320,
  dropdownHeading,
  compactOptions = false,
  denseOptions = false,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  children?: ReactNode
  value?: string
  defaultValue?: string
  onChange?: (event: SelectValueChangeEvent) => void
  name?: string
  className?: string
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  required?: boolean
  id?: string
  options?: RichSelectOption[]
  dropdownMinWidth?: number
  dropdownMaxHeight?: number
  dropdownHeading?: string
  compactOptions?: boolean
  denseOptions?: boolean
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const options = useMemo<DisplayOption[]>(() => richOptions
    ? richOptions.map(option => ({
        value: option.value,
        label: option.text,
        content: option.label,
        selectedContent: option.selectedLabel,
        disabled: !!option.disabled,
      }))
    : getOptions(children).map(option => ({ ...option, selectedContent: undefined })),
  [children, richOptions])
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? options[0]?.value ?? '')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [validationError, setValidationError] = useState(false)
  const [position, setPosition] = useState<DropdownPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const value = controlledValue ?? uncontrolledValue
  const selected = options.find(option => option.value === value)
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? options.filter(option => `${option.label} ${option.value}`.toLowerCase().includes(query)) : options
  }, [options, search])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      setSearch('')
      return
    }

    const updatePosition = () => {
      const button = buttonRef.current
      if (!button) return
      const dialog = button.closest<HTMLElement>('[role="dialog"]')
      const dialogRect = dialog?.getBoundingClientRect()
      const buttonRect = button.getBoundingClientRect()
      const boundsTop = Math.max(8, dialogRect?.top ?? 0) + 8
      const boundsBottom = Math.min(window.innerHeight - 8, dialogRect?.bottom ?? window.innerHeight) - 8
      const width = Math.min(Math.max(buttonRect.width, dropdownMinWidth ?? 0), window.innerWidth - 16)
      const left = Math.min(Math.max(buttonRect.left, 8), window.innerWidth - width - 8)
      const availableBelow = Math.max(0, boundsBottom - buttonRect.bottom - 8)
      const availableAbove = Math.max(0, buttonRect.top - boundsTop - 8)
      const openBelow = availableBelow >= availableAbove
      const maxHeight = Math.min(dropdownMaxHeight, openBelow ? availableBelow : availableAbove)
      setPosition({ left, top: openBelow ? buttonRect.bottom + 8 : buttonRect.top - maxHeight - 8, width, maxHeight, openBelow })
    }

    updatePosition()
    const frame = searchable ? window.requestAnimationFrame(() => searchRef.current?.focus()) : undefined
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [dropdownMaxHeight, dropdownMinWidth, open, searchable])

  useLayoutEffect(() => {
    if (!open || !position || position.openBelow) return
    const button = buttonRef.current
    const dropdown = dropdownRef.current
    if (!button || !dropdown) return
    const top = button.getBoundingClientRect().top - dropdown.getBoundingClientRect().height - 8
    setPosition(current => current && current.top !== top ? { ...current, top } : current)
  }, [open, position])

  useLayoutEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function choose(nextValue: string) {
    if (controlledValue === undefined) setUncontrolledValue(nextValue)
    setValidationError(false)
    onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } })
    setOpen(false)
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      {required && (
        <select
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          disabled={disabled}
          onChange={() => undefined}
          onInvalid={event => {
            event.preventDefault()
            setValidationError(true)
            buttonRef.current?.focus()
          }}
          className="pointer-events-none absolute h-px w-px opacity-0"
        >
          {children}
        </select>
      )}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          'form-field flex h-9 w-full items-center justify-between gap-2 rounded-xl text-left text-sm focus:!shadow-none focus:!ring-0 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50',
          (ariaInvalid || validationError) && 'border-red-500 focus:border-red-500 focus:ring-red-100',
          className,
        )}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || validationError}
        aria-describedby={ariaDescribedBy}
        aria-required={required}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span className="min-w-0 flex-1 truncate">{selected ? (selected.selectedContent ?? selected.content ?? selected.label) : placeholder || ''}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {validationError && <span className="sr-only">Please select an option.</span>}
      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[1200] overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        >
          {dropdownHeading && (
            <p className="px-3 pb-2 pt-1 text-sm font-medium text-slate-600">{dropdownHeading}</p>
          )}
          {searchable && (
            <div className="relative mb-2">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={ariaLabel ? `${ariaLabel} search` : searchPlaceholder}
                className="search-input-with-icon h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#0A6F94] focus:bg-white focus:shadow-none focus:ring-0"
              />
            </div>
          )}
          <div
            role="listbox"
            aria-label={ariaLabel}
            className={cn(compactOptions ? 'space-y-2' : 'space-y-1', 'overflow-y-auto')}
            style={{ maxHeight: Math.max(0, position.maxHeight - (searchable ? 60 : 8) - (dropdownHeading ? 28 : 0)) }}
          >
            {filteredOptions.map(option => {
              const active = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => choose(option.value)}
                  className={cn(
                    cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50', compactOptions || denseOptions ? 'py-1' : 'py-2'),
                    active ? 'bg-[#EAF4F8] font-medium text-[#034C68]' : 'text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span className="min-w-0 flex-1 text-left">{option.content ?? <span className="block truncate">{option.label}</span>}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-[#045E80]" />}
                </button>
              )
            })}
            {filteredOptions.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-500">{emptyMessage}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
