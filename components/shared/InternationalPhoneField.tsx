'use client'

import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
}

export function InternationalPhoneField({ value, onChange, disabled, required = true }: Props) {
  return (
    <PhoneInput
      international
      defaultCountry="IN"
      value={value || undefined}
      onChange={nextValue => onChange(nextValue || '')}
      disabled={disabled}
      required={required}
      placeholder="Mobile number"
      className="international-phone-field"
    />
  )
}
