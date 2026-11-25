'use client'

import { Check, ChevronDown, Search, Store, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SiBigbasket, SiSwiggy } from 'react-icons/si'
import { cn } from '@/lib/utils'
import { SearchableSelect } from '@/components/shared/SearchableSelect'

type MarketplaceAccount = {
  id: string
  account_name: string
  platform_name: string
}

type MarketplacePlatform = {
  id: string
  name: string
}

const EMPTY_VALUE = '__goportals_no_selection__'

export function MarketplaceLogo({ name, size = 'xs' }: { name: string; size?: 'xs' | 'sm' | 'md' | 'compact' }) {
  const iconSize = size === 'md' ? 'h-4 w-4' : size === 'sm' ? 'h-3.5 w-3.5' : size === 'compact' ? 'h-[13px] w-[13px]' : 'h-3 w-3'
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  if (key.includes('amazon')) {
    return (
      <svg aria-hidden="true" viewBox="0 0 448 512" className={`${iconSize} shrink-0 text-slate-950`}>
        <path
          fill="currentColor"
          d="M257.2 162.7c-48.7 1.8-169.5 15.5-169.5 117.5 0 109.5 138.3 114 183.5 43.2 6.5 10.2 35.4 37.5 45.3 46.8l56.8-56S341 288.9 341 261.4V114.3C341 89 316.5 32 228.7 32 140.7 32 94 87 94 136.3l73.5 6.8c16.3-49.5 54.2-49.5 54.2-49.5 40.7-.1 35.5 29.8 35.5 69.1zm0 86.8c0 80-84.2 68-84.2 17.2 0-47.2 50.5-56.7 84.2-57.8v40.6z"
        />
        <path
          fill="#FF9900"
          d="M393.2 413c-7.7 10-70 67-174.5 67S34.2 408.5 9.7 379c-6.8-7.7 1-11.3 5.5-8.3C88.5 415.2 203 488.5 387.7 401c7.5-3.7 13.3 2 5.5 12zM433 415.2c-6.5 15.8-16 26.8-21.2 31-5.5 4.5-9.5 2.7-6.5-3.8s19.3-46.5 12.7-55c-6.5-8.3-37-4.3-48-3.2-10.8 1-13 2-14-.3-2.3-5.7 21.7-15.5 37.5-17.5 15.7-1.8 41-.8 46 5.7 3.7 5.1 0 27.1-6.5 43.1z"
        />
      </svg>
    )
  }
  if (key.includes('flipkartminutes') || key.includes('minutes')) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`${iconSize} shrink-0`}>
        <rect width="24" height="24" rx="2" fill="#B7194B" />
        <text x="3.2" y="10.2" fill="#FFF" fontSize="4.3" fontWeight="700" fontStyle="italic" fontFamily="Arial, sans-serif">Flipkart</text>
        <text x="3" y="15.3" fill="#FFE500" fontSize="4.6" fontWeight="800" fontStyle="italic" fontFamily="Arial, sans-serif">MINUTES</text>
      </svg>
    )
  }
  if (key.includes('flipkart')) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`${iconSize} shrink-0`}>
        <circle cx="12" cy="12" r="11.8" fill="#FFE500" />
        <path
          fill="#1E43B8"
          d="M17.35 4.15c-2.45-.37-4.55.1-6.02 1.35-1.35 1.14-2.16 2.72-2.43 4.72l-.17 1.38-4.48.2-2.1.4 2.42.55 1.55.34.18.56-2.42.3-2.05.45 4.86.22.2.56-2.2.25-2.72.57 6.45.27-.8 3.73h4.35l.78-4.94h2.75c1.16 0 1.75-.54 1.9-1.62.16-1.07-.3-1.62-1.38-1.62H13l.22-1.22c.2-1.1.63-1.92 1.34-2.43.6-.44 1.37-.65 2.3-.65h.38c.7 0 1.08-.3 1.1-.9.02-.38-.13-1.1-.2-1.43-.07-.36-.3-.67-.79-.84Z"
        />
      </svg>
    )
  }
  if (key.includes('swiggy')) return <SiSwiggy aria-hidden="true" className={`${iconSize} shrink-0 text-[#FC8019]`} />
  if (key.includes('bigbasket')) return <SiBigbasket aria-hidden="true" className={`${iconSize} shrink-0 text-[#84C225]`} />
  if (key.includes('ownwebsite')) return <Store aria-hidden="true" className={`${iconSize} shrink-0 text-sky-600`} />
  return <Store aria-hidden="true" className={`${iconSize} shrink-0 text-slate-500`} />
}

export function MarketplacePlatformLabel({ name, logoSize = 'xs', className }: { name: string; logoSize?: 'xs' | 'sm' | 'md' | 'compact'; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-normal', className)}>
      <MarketplaceLogo name={name} size={logoSize} />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}

export function MarketplaceAccountLabel({ platformName, accountName, size = 'xs' }: {
  platformName: string | null
  accountName: string | null
  size?: 'xs' | 'sm' | 'md' | 'compact'
}) {
  const platform = platformName?.trim() ?? ''
  const account = accountName?.trim() ?? ''
  const label = platform || account
  if (!label) return null

  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${size === 'md' ? 'text-base' : size === 'sm' ? 'text-sm' : size === 'compact' ? 'text-xs' : 'text-xs'} font-normal`}>
      <MarketplaceLogo name={label} size={size} />
      <span className="min-w-0 truncate">{label}</span>
      {account && platform && account.toLocaleLowerCase() !== platform.toLocaleLowerCase() && (
        <span className="min-w-0 truncate text-slate-500">· {account}</span>
      )}
    </span>
  )
}

function MarketplaceSelect({ value, placeholder, onChange, items, disabled, className, id, invalid = false, ariaDescribedBy }: {
  value: string
  placeholder: string
  onChange: (value: string) => void
  items: { id: string; label: React.ReactNode; textLabel: string }[]
  disabled?: boolean
  className?: string
  id?: string
  invalid?: boolean
  ariaDescribedBy?: string
}) {
  return (
    <SearchableSelect
      id={id}
      value={value || EMPTY_VALUE}
      onChange={event => onChange(event.target.value === EMPTY_VALUE ? '' : event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={placeholder}
      aria-invalid={invalid}
      aria-describedby={ariaDescribedBy}
      className={cn('form-field flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden text-left', invalid && 'border-red-400 bg-red-50/30 focus:border-red-500', className)}
      options={[
        { value: EMPTY_VALUE, label: <span className="text-slate-500">{placeholder}</span>, text: placeholder },
        ...items.map(item => ({ value: item.id, label: item.label, text: item.textLabel })),
      ]}
    />
  )
}

export function MarketplaceAccountSelect({ accounts, value, onChange, placeholder, id, invalid, ariaDescribedBy }: {
  accounts: MarketplaceAccount[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  id?: string
  invalid?: boolean
  ariaDescribedBy?: string
}) {
  return (
    <MarketplaceSelect
      id={id}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      invalid={invalid}
      ariaDescribedBy={ariaDescribedBy}
      items={accounts.map(account => ({
        id: account.id,
        label: <MarketplaceAccountLabel platformName={account.platform_name} accountName={account.account_name} />,
        textLabel: `${account.platform_name ?? ''} ${account.account_name ?? ''}`.trim(),
      }))}
    />
  )
}

export function MarketplacePlatformMultiSelect({ platforms, value, onChange, placeholder, disabled, className, id }: {
  platforms: MarketplacePlatform[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  disabled?: boolean
  className?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = useMemo(
    () => value.map(id => platforms.find(platform => platform.id === id)).filter((platform): platform is MarketplacePlatform => Boolean(platform)),
    [platforms, value],
  )
  const filtered = useMemo(() => platforms.filter(platform => platform.name.toLowerCase().includes(query.trim().toLowerCase())), [platforms, query])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  function toggle(platformId: string) {
    onChange(value.includes(platformId) ? value.filter(id => id !== platformId) : [...value, platformId])
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button id={id} type="button" aria-label="Platforms" aria-haspopup="listbox" aria-expanded={open}
        disabled={disabled} onClick={() => setOpen(current => !current)}
        className={cn('form-field flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden text-left', className)}>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {selected.length ? selected.map(platform => <span key={platform.id} className="shrink-0"><MarketplacePlatformLabel name={platform.name} /></span>)
            : <span className="truncate text-slate-500">{placeholder}</span>}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && <div role="listbox" aria-label="Select platforms" aria-multiselectable="true" className="absolute z-40 mt-1 w-full min-w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
        <div className="relative mb-2">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search platforms..." className="form-field dropdown-search-input search-input-with-icon h-9 w-full rounded-lg text-sm focus:ring-0" aria-label="Search platforms" />
        </div>
        <div className="-mr-2 max-h-56 space-y-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
          {filtered.map(platform => {
            const checked = value.includes(platform.id)
            return <button key={platform.id} type="button" role="option" aria-selected={checked} onClick={() => toggle(platform.id)}
              className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left',
                checked ? 'bg-[#EAF4F8] hover:bg-[#EAF4F8]' : 'hover:bg-slate-50')}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="relative flex h-4 w-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />
                  <span className={cn('flex h-full w-full items-center justify-center rounded-[3px] border',
                    checked ? 'border-[#045E80] bg-[#045E80]' : 'border-slate-400 bg-white')}>
                    {checked && <Check aria-hidden="true" className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </span>
                </span>
                <MarketplacePlatformLabel name={platform.name} logoSize="compact" className="text-[13px]" />
              </span>
              {checked && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-[#045E80]" />}
            </button>
          })}
          {!filtered.length && <p className="px-3 py-2 text-sm text-slate-500">No platforms found.</p>}
        </div>
        {selected.length > 0 && (
          <div className="mt-2 flex items-start justify-between border-t border-slate-100 pt-2">
            <div aria-label="Selected platforms" className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-2 py-1 pr-3">
              {selected.map(platform => (
                <span key={platform.id} title={platform.name} className="inline-flex h-3.5 w-3.5 items-center justify-center">
                  <MarketplaceLogo name={platform.name} size="compact" />
                  <span className="sr-only">{platform.name}</span>
                </span>
              ))}
            </div>
            <button
              type="button"
              aria-label="Clear selected platforms"
              onClick={() => onChange([])}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#045E80] hover:bg-[#045E80] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#045E80]"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>}
    </div>
  )
}

export function MarketplacePlatformSelect({ platforms, value, onChange, placeholder, disabled, className, id, invalid, ariaDescribedBy }: {
  platforms: MarketplacePlatform[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  className?: string
  id?: string
  invalid?: boolean
  ariaDescribedBy?: string
}) {
  return (
    <MarketplaceSelect
      id={id}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      invalid={invalid}
      ariaDescribedBy={ariaDescribedBy}
      disabled={disabled}
      className={className}
      items={platforms.map(platform => ({
        id: platform.id,
        label: <MarketplacePlatformLabel name={platform.name} />,
        textLabel: platform.name,
      }))}
    />
  )
}
