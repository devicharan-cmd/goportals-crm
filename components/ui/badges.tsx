import { CalendarDays, Flame } from 'lucide-react'
import { cn, dueLabel, dueState } from '@/lib/utils'
import {
  ACCOUNT_STATUS_STYLES, PRIORITY_STYLES, SERVICE_STATUS_LABELS, SERVICE_STATUS_STYLES,
} from '@/lib/constants'
import type { AccountStatus, ClientServiceStatus, TaskPriority, TaskStatus } from '@/types/database'

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
      className ?? 'bg-slate-100 text-slate-700 ring-slate-200',
    )}>
      {children}
    </span>
  )
}

/** Renders either a task or a ticket status — pass the right label/style/dot from lib/constants (TASK_STATUS_* or TICKET_STATUS_*). */
export function StatusBadge({ label, className, dotClassName }: { label: string; className: string; dotClassName: string }) {
  return (
    <Badge className={className}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClassName)} />
      {label}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge className={cn('font-bold', PRIORITY_STYLES[priority])}>{priority}</Badge>
}

export function UrgentBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn('rounded-md border border-red-700 bg-gradient-to-r from-red-600 to-red-700 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white ring-red-700', className)}>
      <Flame className="h-3 w-3" /> Urgent
    </Badge>
  )
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <Badge className={cn('capitalize', ACCOUNT_STATUS_STYLES[status])}>{status}</Badge>
}

export function ClientServiceStatusBadge({ status }: { status: ClientServiceStatus }) {
  return <Badge className={SERVICE_STATUS_STYLES[status]}>{SERVICE_STATUS_LABELS[status]}</Badge>
}

const DUE_STYLES = {
  overdue: 'text-red-600 font-semibold',
  today:   'text-red-600 font-semibold',
  soon:    'text-amber-600 font-medium',
  ok:      'text-slate-500',
  none:    'text-slate-400',
  completed: 'text-[#5B771A] font-medium',
  cancelled: 'text-slate-400',
}

export function DueDate({ date, status, className }: { date: string | null; status?: TaskStatus; className?: string }) {
  return <span className={cn('text-xs', DUE_STYLES[dueState(date, status)], className)} suppressHydrationWarning>{dueLabel(date, status)}</span>
}

const DUE_BACKGROUND_STYLES = {
  overdue: 'bg-red-50',
  today: 'bg-red-50',
  soon: 'bg-amber-50',
  ok: 'bg-slate-100',
  none: 'bg-slate-100',
  completed: 'bg-[#F5FAE8]',
  cancelled: 'bg-slate-100',
}

export function DueDatePill({ date, status, className }: { date: string | null; status?: TaskStatus; className?: string }) {
  const state = dueState(date, status)
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs', DUE_STYLES[state], DUE_BACKGROUND_STYLES[state], className)}
      suppressHydrationWarning
    >
      <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {dueLabel(date, status)}
    </span>
  )
}
