'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { getCountries, getCountryCallingCode, parsePhoneNumber, type Country } from 'react-phone-number-input'
import en from 'react-phone-number-input/locale/en.json'
import flags from 'react-phone-number-input/flags'

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  invalid?: boolean
}

function CountryFlag({ country }: { country: Country }) {
  const Flag = flags[country]
  if (!Flag) return null
  return <Flag title={en[country] || country} />
}

function inferCountry(value: string): Country | null {
  if (value?.startsWith('+')) {
    const parsed = parsePhoneNumber(value)
    if (parsed?.country) return parsed.country
  }
  return null
}

function nationalNumber(value: string, country: Country | null) {
  if (!value) return ''
  if (value.startsWith('+')) {
    const parsed = parsePhoneNumber(value)
    if (parsed?.country === country) return parsed.nationalNumber || ''
    if (!country) return parsed?.nationalNumber || ''
    const callingCode = getCountryCallingCode(country)
    return value.replace(`+${callingCode}`, '').replace(/\D/g, '')
  }
  const digits = value.replace(/\D/g, '')
  if (!country) return digits
  const callingCode = getCountryCallingCode(country)
  if (digits.startsWith(callingCode)) return digits.slice(callingCode.length)
  return digits
}

export function InternationalPhoneField({ value, onChange, disabled, required = true, invalid = false }: Props) {
  const [country, setCountry] = useState<Country | null>(() => inferCountry(value))
  const [digits, setDigits] = useState(() => nationalNumber(value, inferCountry(value)))
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const countryRef = useRef<Country | null>(inferCountry(value))
  const countries = useMemo(() => getCountries(), [])

  useEffect(() => {
    const nextCountry = inferCountry(value)
    if (nextCountry) {
      countryRef.current = nextCountry
      setCountry(nextCountry)
      setDigits(nationalNumber(value, nextCountry))
      return
    }

    const selectedCountry = countryRef.current
    if (!selectedCountry) {
      setCountry(null)
      setDigits(value.replace(/\D/g, ''))
      return
    }

    const callingCode = getCountryCallingCode(selectedCountry)
    const compact = value.replace(/\D/g, '')
    setCountry(selectedCountry)
    setDigits(compact.startsWith(callingCode) ? compact.slice(callingCode.length) : compact)
  }, [value])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function closeOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])

  const filtered = countries.filter(item => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    const name = en[item] || item
    return `${name} ${item} +${getCountryCallingCode(item)}`.toLowerCase().includes(query)
  })

  function updateDigits(nextDigits: string) {
    const clean = nextDigits.replace(/\D/g, '')
    setDigits(clean)
    onChange(clean && countryRef.current ? `+${getCountryCallingCode(countryRef.current)}${clean}` : clean)
  }

  function chooseCountry(nextCountry: Country) {
    countryRef.current = nextCountry
    setCountry(nextCountry)
    setOpen(false)
    setSearch('')
    if (digits) onChange(`+${getCountryCallingCode(nextCountry)}${digits}`)
  }

  return (
    <div ref={rootRef} className={`international-phone-field ${invalid ? 'international-phone-field-invalid' : ''} ${disabled ? 'opacity-70' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label="Select phone country"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="phone-country-trigger"
        onClick={() => setOpen(current => !current)}
      >
        {country ? (
          <>
            <span className="phone-country-flag" aria-hidden="true"><CountryFlag country={country} /></span>
            <span className="phone-country-code">+{getCountryCallingCode(country)}</span>
          </>
        ) : (
          <span className="phone-country-globe" aria-hidden="true">🌐</span>
        )}
        <ChevronDown className="phone-country-chevron" size={14} aria-hidden="true" />
      </button>
      <input
        type="tel"
        value={digits}
        disabled={disabled}
        required={required}
        placeholder="Mobile number"
        aria-label="Mobile number"
        aria-invalid={invalid || undefined}
        className="PhoneInputInput"
        onChange={event => updateDigits(event.target.value)}
      />
      {open && (
        <div className="phone-country-popover" role="listbox">
          <input
            ref={searchRef}
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search country..."
            className="phone-country-search"
            aria-label="Search country"
          />
          <div className="phone-country-list">
            {filtered.map(item => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={country === item}
                className="phone-country-option"
                onClick={() => chooseCountry(item)}
              >
                <span className="phone-country-list-flag" aria-hidden="true"><CountryFlag country={item} /></span>
                <span className="min-w-0 flex-1 truncate">{en[item] || item}</span>
                <span className="text-slate-500">+{getCountryCallingCode(item)}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="phone-country-empty">No countries found</div>}
          </div>
        </div>
      )}
    </div>
  )
}
