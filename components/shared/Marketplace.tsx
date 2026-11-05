'use client'

import { Store } from 'lucide-react'
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
  if (key.includes('flipkart')) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`${iconSize} shrink-0 text-[#2874F0]`}>
        <path
          fill="currentColor"
          d="M3.833 1.333a.993.993 0 0 0-.333.061V1c0-.551.449-1 1-1h14.667c.551 0 1 .449 1 1v.333H3.833zm17.334 2.334H2.833c-.551 0-1 .449-1 1V23c0 .551.449 1 1 1h7.3l1.098-5.645h-2.24c-.051 0-5.158-.241-5.158-.241l4.639-.327-.078-.366-1.978-.285 1.882-.158-.124-.449-3.075-.467s3.341-.373 3.392-.373h3.232l.247-1.331c.289-1.616.945-2.807 1.973-3.693 1.033-.892 2.344-1.332 3.937-1.332.643 0 1.053.151 1.231.463.118.186.201.516.279.859.074.352.14.671.095.903-.057.345-.461.465-1.197.465h-.253c-1.327 0-2.134.763-2.405 2.31l-.243 1.355h1.54c.574 0 .781.402.622 1.306-.17.941-.539 1.36-1.111 1.36H14.9L13.804 24h7.362c.551 0 1-.449 1-1V4.667a1 1 0 0 0-.999-1zM20.5 2.333A.334.334 0 0 0 20.167 2H3.833a.334.334 0 0 0-.333.333V3h17v-.667z"
        />
      </svg>
    )
  }
  if (key.includes('swiggy')) return <SiSwiggy aria-hidden="true" className={`${iconSize} shrink-0 text-[#FC8019]`} />
  if (key.includes('bigbasket')) return <SiBigbasket aria-hidden="true" className={`${iconSize} shrink-0 text-[#84C225]`} />
  if (key.includes('ownwebsite')) return <Store aria-hidden="true" className={`${iconSize} shrink-0 text-sky-600`} />
  return <Store aria-hidden="true" className={`${iconSize} shrink-0 text-slate-500`} />
}

export function MarketplacePlatformLabel({ name }: { name: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-normal">
      <MarketplaceLogo name={name} />
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
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${size === 'md' ? 'text-base' : size === 'sm' ? 'text-sm' : size === 'compact' ? 'text-[13px]' : 'text-xs'} font-normal`}>
      <MarketplaceLogo name={label} size={size} />
      <span className="min-w-0 truncate">{label}</span>
      {account && platform && account.toLocaleLowerCase() !== platform.toLocaleLowerCase() && (
        <span className="min-w-0 truncate text-slate-500">· {account}</span>
      )}
    </span>
  )
}

function MarketplaceSelect({ value, placeholder, onChange, items, disabled, className }: {
  value: string
  placeholder: string
  onChange: (value: string) => void
  items: { id: string; label: React.ReactNode; textLabel: string }[]
  disabled?: boolean
  className?: string
}) {
  return (
    <SearchableSelect
      value={value || EMPTY_VALUE}
      onChange={event => onChange(event.target.value === EMPTY_VALUE ? '' : event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={placeholder}
      className={cn('input flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden text-left', className)}
      options={[
        { value: EMPTY_VALUE, label: <span className="text-slate-500">{placeholder}</span>, text: placeholder },
        ...items.map(item => ({ value: item.id, label: item.label, text: item.textLabel })),
      ]}
    />
  )
}

export function MarketplaceAccountSelect({ accounts, value, onChange, placeholder }: {
  accounts: MarketplaceAccount[]
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <MarketplaceSelect
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      items={accounts.map(account => ({
        id: account.id,
        label: <MarketplaceAccountLabel platformName={account.platform_name} accountName={account.account_name} />,
        textLabel: `${account.platform_name ?? ''} ${account.account_name ?? ''}`.trim(),
      }))}
    />
  )
}

export function MarketplacePlatformSelect({ platforms, value, onChange, placeholder, disabled, className }: {
  platforms: MarketplacePlatform[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  className?: string
}) {
  return (
    <MarketplaceSelect
      value={value}
      placeholder={placeholder}
      onChange={onChange}
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
