import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns'
import type { DeadlineType, TaskStatus } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Everything is rendered on the server, which runs in UTC, while the team and
// the clients are in India — without a fixed zone a ticket raised at 1am IST
// showed yesterday's date.
const IST = 'Asia/Kolkata'

export function dateKeyInTimeZone(date: Date, timeZone = IST): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value
  const year = get('year')
  const month = get('month')
  const day = get('day')
  if (!year || !month || !day) throw new RangeError(`Could not determine calendar date in ${timeZone}`)
  return `${year}-${month}-${day}`
}

export function todayDateKey(now = new Date()): string {
  return dateKeyInTimeZone(now)
}

function calendarDayNumber(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new RangeError(`Invalid date-only value: ${dateKey}`)
  const dayNumber = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000
  if (new Date(dayNumber * 86_400_000).toISOString().slice(0, 10) !== dateKey) {
    throw new RangeError(`Invalid date-only value: ${dateKey}`)
  }
  return dayNumber
}

function dateKeyFromCalendarDay(dayNumber: number): string {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST })
    .format(new Date(date))
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatINR(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return '₹' + Number(amount).toLocaleString('en-IN')
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase() || '?'
}

export type DueState = 'overdue' | 'today' | 'soon' | 'ok' | 'none' | 'completed' | 'cancelled'

function daysUntilDue(dueDate: string, now: Date): number {
  return calendarDayNumber(dueDate) - calendarDayNumber(todayDateKey(now))
}

/** Date-only deadlines use India calendar days; the due date remains current through its full local day. */
export function dueState(dueDate: string | null | undefined, status?: TaskStatus, now = new Date()): DueState {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (!dueDate) return 'none'
  const days = daysUntilDue(dueDate, now)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  return 'ok'
}

export function dueLabel(dueDate: string | null | undefined, status?: TaskStatus, now = new Date()): string {
  const state = dueState(dueDate, status, now)
  if (state === 'completed') return 'Completed'
  if (state === 'cancelled') return 'Cancelled'
  if (state === 'none') return 'No due date'
  if (state === 'today') return 'Due today'
  const days = daysUntilDue(dueDate!, now)
  if (state === 'overdue') {
    const overdueDays = -days
    return `${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue`
  }
  return `Due in ${days} ${days === 1 ? 'day' : 'days'}`
}

/** Due date for a quick deadline button: today / coming Sunday / end of month (yyyy-MM-dd). */
export function dueDateFor(type: DeadlineType, now = new Date()): string {
  const today = todayDateKey(now)
  const todayNumber = calendarDayNumber(today)
  if (type === 'today') return today
  if (type === 'this_week') {
    const weekday = new Date(todayNumber * 86_400_000).getUTCDay()
    return dateKeyFromCalendarDay(todayNumber + (7 - weekday) % 7)
  }
  const [year, month] = today.split('-').map(Number)
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`
}

export function capacityColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-brand-500'
}

export function capacityTextColor(pct: number): string {
  if (pct >= 100) return 'text-red-600'
  if (pct >= 80) return 'text-amber-600'
  return 'text-slate-700'
}

/** Client relationship health (0-100): green when good, red when at risk. */
export function healthColor(score: number): string {
  if (score >= 70) return 'bg-lime-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

export function healthTextColor(score: number): string {
  if (score >= 70) return 'text-lime-700'
  if (score >= 40) return 'text-amber-700'
  return 'text-red-600'
}

const DUPLICATE_KEY_MESSAGES: Record<string, string> = {
  client_services_per_account_uniq: 'That service is already priced for this account — edit the existing row instead of adding it twice.',
  client_services_whole_client_uniq: 'That service is already added for this client — edit the existing row instead of adding it twice.',
  ecommerce_accounts_client_platform_name_uniq: 'An account with that name already exists on this platform for this client.',
  ecommerce_accounts_platform_seller_uniq: 'That seller ID is already registered to another account on this platform.',
}

/** Turn a Supabase/Postgres error into a message for users. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong'
  if (typeof err === 'string') return err
  const msg = (err as { message?: string }).message ?? 'Something went wrong'
  if (msg.includes('row-level security')) return "You don't have permission to do that."
  if (msg.includes('duplicate key value violates unique constraint')) {
    const m = msg.match(/"([^"]+)"/)
    return (m && DUPLICATE_KEY_MESSAGES[m[1]]) || "That already exists — you can't add the same thing twice."
  }
  return msg
}

/** Human-friendly task ID, e.g. GP-1024 (tasks.task_number, migration 010). */
export function taskCode(n: number | null | undefined): string {
  return n ? `GP-${n}` : ''
}

/** Reads "GP-1024", "gp1024", "#1024" or "1024" → 1024. Anything else → null. */
export function parseTaskCode(s: string | null | undefined): number | null {
  const m = (s ?? '').trim().match(/^(?:gp-?|#)?(\d{1,9})$/i)
  return m ? Number(m[1]) : null
}

/** Human-friendly ticket ID, e.g. TK-1024 (tickets.ticket_number, migration 014). */
export function ticketCode(n: number | null | undefined): string {
  return n ? `TK-${n}` : ''
}

/** Reads "TK-1024", "tk1024", "#1024" or "1024" → 1024. Anything else → null. */
export function parseTicketCode(s: string | null | undefined): number | null {
  const m = (s ?? '').trim().match(/^(?:tk-?|#)?(\d{1,9})$/i)
  return m ? Number(m[1]) : null
}

/**
 * Splits "GoPortals team (Manager)" into the name and its qualifier, so the
 * qualifier can be said quieter than the name wherever a client reads it.
 */
export function splitTeamName(name: string): [string, string | null] {
  const m = name?.match(/^(.*?)\s+\((.+)\)$/)
  return m ? [m[1], m[2]] : [name ?? '', null]
}
