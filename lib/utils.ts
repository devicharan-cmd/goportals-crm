import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInCalendarDays, endOfMonth, format, formatDistanceToNow, nextSunday, isSunday } from 'date-fns'
import type { DeadlineType, TaskStatus } from '@/types/database'
import { TASK_TERMINAL_STATUSES } from '@/lib/constants'
const TERMINAL = new Set<string>(TASK_TERMINAL_STATUSES)

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

export function formatINR(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return '₹' + Number(amount).toLocaleString('en-IN')
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export type DueState = 'overdue' | 'today' | 'soon' | 'ok' | 'none'

/** Days from today (calendar days). <0 overdue, 0 today, ≤3 soon. Done tasks are never overdue. */
export function dueState(dueDate: string | null | undefined, status?: TaskStatus): DueState {
  if (!dueDate || (status && TERMINAL.has(status))) return 'none'
  const days = differenceInCalendarDays(new Date(dueDate), new Date())
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  return 'ok'
}

export function dueLabel(dueDate: string | null | undefined, status?: TaskStatus): string {
  const s = dueState(dueDate, status)
  if (s === 'none') return dueDate ? `Due ${formatDate(dueDate)}` : 'No due date'
  const days = differenceInCalendarDays(new Date(dueDate!), new Date())
  if (s === 'overdue') return `${-days}d overdue`
  if (s === 'today') return 'Due today'
  return `Due in ${days}d`
}

/** Due date for a quick deadline button: today / coming Sunday / end of month (yyyy-MM-dd). */
export function dueDateFor(type: DeadlineType): string {
  const today = new Date()
  const d = type === 'today' ? today
          : type === 'this_week' ? (isSunday(today) ? today : nextSunday(today))
          : endOfMonth(today)
  return format(d, 'yyyy-MM-dd')
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
