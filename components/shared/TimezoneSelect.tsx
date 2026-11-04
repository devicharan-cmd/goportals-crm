'use client'

import { useMemo } from 'react'

const FALLBACK_TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Australia/Sydney',
]

export function TimezoneSelect({
  value,
  onChange,
  disabled = false,
  required = true,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
}) {
  const values = useMemo(() => {
    const intlWithTimeZones = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
    const supported = typeof intlWithTimeZones.supportedValuesOf === 'function'
      ? intlWithTimeZones.supportedValuesOf('timeZone')
      : FALLBACK_TIMEZONES
    return Array.from(new Set([value, ...supported].filter(Boolean))).sort()
  }, [value])

  return (
    <select
      className="input"
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled}
      required={required}
    >
      <option value="">Select timezone</option>
      {values.map(timezone => <option key={timezone} value={timezone}>{timezone.replaceAll('_', ' ')}</option>)}
    </select>
  )
}
