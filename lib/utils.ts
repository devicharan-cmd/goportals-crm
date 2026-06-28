import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast, isWithinInterval, addDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false
  return isPast(new Date(dueDate))
}

export function isDueSoon(dueDate: string | null | undefined, days = 2): boolean {
  if (!dueDate) return false
  const due = new Date(dueDate)
  return isWithinInterval(due, { start: new Date(), end: addDays(new Date(), days) })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getHealthColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400'
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-yellow-600'
  return 'text-red-600'
}

export function getCapacityColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-yellow-500'
  return 'bg-blue-500'
}

export function truncate(str: string, maxLength = 60): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '…'
}
