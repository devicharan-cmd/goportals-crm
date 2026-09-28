import type {
  AccountStatus, AppRole, ClientStage, DeadlineType, PlatformCategory,
  TaskPriority, TaskStatus, TaskType,
} from '@/types/database'

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  manager:     'Manager / TL',
  employee:    'Employee',
  client:      'Client',
}

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'in_review',   label: 'In review' },
  { value: 'blocked',     label: 'Blocked' },
  { value: 'done',        label: 'Done' },
]
export const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label])) as Record<TaskStatus, string>

export const STATUS_STYLES: Record<TaskStatus, string> = {
  open:        'bg-slate-100 text-slate-700 ring-slate-200',
  in_progress: 'bg-brand-50 text-brand-700 ring-brand-200',
  in_review:   'bg-violet-50 text-violet-700 ring-violet-200',
  blocked:     'bg-red-50 text-red-700 ring-red-200',
  done:        'bg-lime-50 text-lime-700 ring-lime-200',
}

export const STATUS_DOT: Record<TaskStatus, string> = {
  open:        'bg-slate-400',
  in_progress: 'bg-brand-500',
  in_review:   'bg-violet-500',
  blocked:     'bg-red-500',
  done:        'bg-lime-500',
}

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
