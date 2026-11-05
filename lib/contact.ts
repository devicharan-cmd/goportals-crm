export function validateMobilePhone(value: string): string | null {
  const phone = value.trim()
  if (!phone) return 'Mobile number is required.'
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return 'Enter a valid mobile number with its country code.'
  return null
}

export function isValidTimeZone(value: string): boolean {
  if (!value.trim()) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}
