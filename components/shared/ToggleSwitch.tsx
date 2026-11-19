'use client'

import { cn } from '@/lib/utils'

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={cn(
      'inline-flex items-center gap-2 text-xs font-medium',
      disabled ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-600',
      className,
    )}>
      <span>{label}</span>
      <span className="relative inline-flex h-6 w-10 shrink-0">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={event => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span aria-hidden="true" className={cn(
          'pointer-events-none absolute inset-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-[#045E80] peer-focus-visible:ring-offset-2 peer-disabled:opacity-60',
          checked ? 'bg-[#045E80] after:translate-x-4' : 'bg-slate-300 after:translate-x-0',
        )} />
      </span>
    </label>
  )
}
