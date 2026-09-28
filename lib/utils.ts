import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInCalendarDays, endOfMonth, format, formatDistanceToNow, nextSunday, isSunday } from 'date-fns'
import type { DeadlineType, TaskStatus } from '@/types/database'

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
  if (!dueDate || status === 'done') return 'none'
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

/** Turn a Supabase/Postgres error into a message for users. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong'
  if (typeof err === 'string') return err
  const msg = (err as { message?: string }).message ?? 'Something went wrong'
  if (msg.includes('row-level security')) return "You don't have permission to do that."
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
