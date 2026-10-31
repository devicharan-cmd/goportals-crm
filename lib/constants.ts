import type {
  AccountStatus, AppRole, BillingType, ClientServiceStatus, ClientStage, DeadlineType, PlatformCategory,
  TaskPriority, TaskStatus, TaskType, TicketStatus,
} from '@/types/database'

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Manager',
  team_lead:   'Team Lead',
  employee:    'Employee',
  client:      'Client',
}

/** Shared role palette for avatars and role badges. */
export const ROLE_STYLES: Record<AppRole, { avatar: string; badge: string; text: string }> = {
  super_admin: { avatar: 'bg-red-100 text-red-700', badge: 'border-red-200 text-red-700 hover:border-red-500', text: 'text-red-700' },
  admin:       { avatar: 'bg-amber-100 text-amber-700', badge: 'border-sky-200 text-sky-700 hover:border-sky-500', text: 'text-sky-700' },
  team_lead:   { avatar: 'bg-violet-100 text-violet-700', badge: 'border-violet-200 text-violet-700 hover:border-violet-500', text: 'text-violet-700' },
  employee:    { avatar: 'bg-emerald-100 text-emerald-700', badge: 'border-emerald-200 text-emerald-700 hover:border-emerald-500', text: 'text-emerald-700' },
  client:      { avatar: 'bg-lime-100 text-lime-800', badge: 'border-lime-200 text-lime-800 hover:border-lime-500', text: 'text-lime-800' },
}

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo',               label: 'Todo' },
  { value: 'in_progress',        label: 'In progress' },
  { value: 'ready_for_review',   label: 'Ready for review' },
  { value: 'changes_requested',  label: 'Changes requested' },
  { value: 'completed',          label: 'Completed' },
  { value: 'cancelled',          label: 'Cancelled' },
]
export const TASK_STATUS_LABELS = Object.fromEntries(TASK_STATUS_OPTIONS.map(s => [s.value, s.label])) as Record<TaskStatus, string>

export const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  todo:              'bg-slate-100 text-slate-700 ring-slate-200',
  in_progress:       'bg-brand-50 text-brand-700 ring-brand-200',
  ready_for_review:  'bg-violet-50 text-violet-700 ring-violet-200',
  changes_requested: 'bg-orange-50 text-orange-700 ring-orange-200',
  completed:         'bg-lime-50 text-lime-700 ring-lime-200',
  cancelled:         'bg-slate-200 text-slate-500 ring-slate-300',
}

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  todo:              'bg-slate-400',
  in_progress:       'bg-brand-500',
  ready_for_review:  'bg-violet-500',
  changes_requested: 'bg-orange-500',
  completed:         'bg-lime-500',
  cancelled:         'bg-slate-400',
}

export const TASK_TERMINAL_STATUSES: TaskStatus[] = ['completed', 'cancelled']

export const TICKET_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'new',                    label: 'New' },
  { value: 'under_review',           label: 'Under review' },
  { value: 'assigned',               label: 'Assigned' },
  { value: 'in_progress',            label: 'In progress' },
  { value: 'ready_for_review',       label: 'Ready for review' },
  { value: 'resolved',               label: 'Resolved' },
  { value: 'ready_for_client',       label: 'Client review' },
  { value: 'reopened',               label: 'Reopened' },
  { value: 'closed',                 label: 'Closed' },
]
export const TICKET_STATUS_LABELS = {
  ...Object.fromEntries(TICKET_STATUS_OPTIONS.map(s => [s.value, s.label])),
  awaiting_clarification: 'Under review', // legacy storage value; reply requests now come from conversation messages
} as Record<TicketStatus, string>

/**
 * The same stages said to the client whose ticket it is, and the only wording
 * they should ever read. It must match ticket_status_label_client() in the
 * database, which words their notifications — the two drifted apart once and
 * the same stage reached the client under two different names.
 *
 * Two stages are easy to get backwards. ready_for_review is our own team
 * checking the work, so it must not sound like the client's turn; resolved
 * and ready_for_client both are their turn, since the portal offers approve
 * and request-changes on either.
 */
export const TICKET_STATUS_LABELS_CLIENT: Record<TicketStatus, string> = {
  ...TICKET_STATUS_LABELS,
  awaiting_clarification: 'Under review',
  ready_for_review:       'Team review',
  resolved:               'Ready for your approval',
  ready_for_client:       'Ready for your approval',
}

export const TICKET_STATUS_STYLES: Record<TicketStatus, string> = {
  new:                    'bg-slate-100 text-slate-700 ring-slate-200',
  under_review:           'bg-violet-50 text-violet-700 ring-violet-200',
  awaiting_clarification: 'bg-violet-50 text-violet-700 ring-violet-200',
  assigned:               'bg-sky-50 text-sky-700 ring-sky-200',
  in_progress:            'bg-brand-50 text-brand-700 ring-brand-200',
  ready_for_review:       'bg-violet-50 text-violet-700 ring-violet-200',
  ready_for_client:       'bg-teal-50 text-teal-700 ring-teal-200',
  resolved:               'bg-amber-50 text-amber-700 ring-amber-200',
  reopened:               'bg-orange-50 text-orange-700 ring-orange-200',
  closed:                 'bg-slate-100 text-slate-600 ring-slate-300',
}

export const TICKET_STATUS_DOT: Record<TicketStatus, string> = {
  new:                    'bg-slate-400',
  under_review:           'bg-violet-500',
  awaiting_clarification: 'bg-violet-500',
  assigned:               'bg-sky-500',
  in_progress:            'bg-brand-500',
  ready_for_review:       'bg-violet-500',
  ready_for_client:       'bg-teal-500',
  resolved:               'bg-amber-500',
  reopened:               'bg-orange-500',
  closed:                 'bg-slate-500',
}

export const TICKET_TERMINAL_STATUSES: TicketStatus[] = ['closed']

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'P1', label: 'P1 · Critical' },
  { value: 'P2', label: 'P2 · High' },
  { value: 'P3', label: 'P3 · Normal' },
  { value: 'P4', label: 'P4 · Low' },
]

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  P1: 'bg-red-50 text-red-700 ring-red-200',
  P2: 'bg-orange-50 text-orange-700 ring-orange-200',
  P3: 'bg-brand-50 text-brand-700 ring-brand-200',
  P4: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'task',      label: 'Task' },
  { value: 'request',   label: 'Request' },
  { value: 'issue',     label: 'Issue' },
  { value: 'grievance', label: 'Grievance' },
]
export const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map(s => [s.value, s.label])) as Record<TaskType, string>

export const DEADLINE_OPTIONS: { value: DeadlineType; label: string }[] = [
  { value: 'today',      label: 'Today' },
  { value: 'this_week',  label: 'This week' },
  { value: 'this_month', label: 'This month' },
]

export const STAGE_OPTIONS: { value: ClientStage; label: string }[] = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'setup',      label: 'Setup' },
  { value: 'scale',      label: 'Scale' },
  { value: 'retention',  label: 'Retention' },
  { value: 'churned',    label: 'Churned' },
]
export const STAGE_LABELS = Object.fromEntries(STAGE_OPTIONS.map(s => [s.value, s.label])) as Record<ClientStage, string>

export const ACCOUNT_STATUS_STYLES: Record<AccountStatus, string> = {
  pending:   'bg-amber-50 text-amber-700 ring-amber-200',
  active:    'bg-lime-50 text-lime-700 ring-lime-200',
  suspended: 'bg-slate-100 text-slate-600 ring-slate-200',
  rejected:  'bg-red-50 text-red-700 ring-red-200',
}

export const SERVICE_STATUS_LABELS: Record<ClientServiceStatus, string> = {
  requested: 'Requested', active: 'Active', stopped: 'Stopped',
}

export const SERVICE_STATUS_STYLES: Record<ClientServiceStatus, string> = {
  requested: 'bg-amber-50 text-amber-700 ring-amber-200',
  active:    'bg-lime-50 text-lime-700 ring-lime-200',
  stopped:   'bg-slate-100 text-slate-500 ring-slate-200',
}

export const BILLING_LABELS: Record<BillingType, string> = {
  monthly: '/mo', one_time: 'one-time', per_task: '/task',
}

export const PLATFORM_CATEGORY_LABELS: Record<PlatformCategory, string> = {
  marketplace:    'Marketplace',
  quick_commerce: 'Quick commerce',
  d2c:            'D2C / Website',
  other:          'Other',
}

export const ACTIVITY_LABELS: Record<string, string> = {
  created:          'created the task',
  status_changed:   'changed status',
  assignee_changed: 'changed assignee',
  due_date_changed: 'changed due date',
  edited:           'edited the details',
  priority_changed: 'changed priority',
  urgent_changed:   'changed urgency',
}
