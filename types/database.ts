// Row types for schema v2 (supabase/migrations/001–004). Keep in sync with the SQL.

export type AppRole       = 'super_admin' | 'admin' | 'team_lead' | 'employee' | 'client'
export type AccountStatus = 'pending' | 'active' | 'suspended' | 'rejected'
export type SignupSource  = 'self_signup' | 'admin_created' | 'invite'
export type ClientStage   = 'onboarding' | 'setup' | 'scale' | 'retention' | 'churned'
export type PlatformCategory    = 'marketplace' | 'quick_commerce' | 'd2c' | 'other'
export type ClientServiceStatus = 'requested' | 'active' | 'stopped'
export type TaskStatus   = 'todo' | 'in_progress' | 'ready_for_review' | 'changes_requested' | 'completed' | 'cancelled'
export type TicketStatus =
  | 'new' | 'under_review' | 'awaiting_clarification' | 'assigned'
  | 'in_progress' | 'ready_for_client' | 'resolved' | 'reopened' | 'closed'
export type TaskPriority  = 'P1' | 'P2' | 'P3' | 'P4'
export type TaskType      = 'task' | 'issue' | 'request' | 'grievance'
export type TaskSource    = 'internal' | 'client'
export type DeadlineType  = 'today' | 'this_week' | 'this_month'
export type EcommerceAccountStatus = 'active' | 'inactive'
export type AddressInputMethod     = 'map' | 'manual'
export type BillingType            = 'monthly' | 'one_time' | 'per_task'
export type TicketCategory =
  | 'new_listing' | 'active_product_change' | 'price_updation' | 'inventory_update'
  | 'ads_campaign' | 'shipment' | 'complaint' | 'new_expansion' | 'report' | 'other'

export type StaffRole = Exclude<AppRole, 'client'>

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: AppRole
  status: AccountStatus
  signup_source: SignupSource | null
  job_title: string | null
  weekly_capacity_hours: number
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface StaffDirectoryEntry {
  id: string
  full_name: string
  avatar_url: string | null
  job_title: string | null
  role: StaffRole
}

export interface Department {
  id: string
  name: string
  slug: string
  sort_order: number
}

export interface Platform {
  id: string
  name: string
  category: PlatformCategory
  is_active: boolean
  sort_order: number
}

export interface Service {
  id: string
  name: string
  description: string | null
  department_id: string | null
  is_active: boolean
  sort_order: number
  default_price: number | null
  default_billing_type: BillingType | null
}

export interface Client {
  id: string
  company_name: string
  gstin: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  whatsapp_group_link: string | null
  owner_id: string | null
  status: AccountStatus
  stage: ClientStage
  signup_source: SignupSource
  approved_by: string | null
  approved_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  address_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  place_id: string | null
  address_source: AddressInputMethod | null
}

export interface ClientInternal {
  client_id: string
  health_score: number
  contract_start: string | null
  contract_end: string | null
  monthly_retainer: number | null
  notes: string | null
}

/** A specific store/seller account (migration 013, renamed from client_platforms). */
export interface EcommerceAccount {
  id: string
  client_id: string
  platform_id: string
  account_name: string
  seller_id: string | null
  store_url: string | null
  country: string | null
  currency: string | null
  status: EcommerceAccountStatus
  total_listings: number
  live_listings: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ClientService {
  id: string
  client_id: string
  service_id: string | null
  custom_name: string | null
  status: ClientServiceStatus
  ecommerce_account_id: string | null
  agreed_price: number | null
  currency: string
  billing_type: BillingType
  selected_by: string | null
  selected_at: string
}

export interface Agreement {
  id: string
  version: string
  title: string
  body: string
  is_current: boolean
  published_at: string | null
  created_at: string
}

export interface AgreementAcceptance {
  id: string
  client_id: string
  profile_id: string
  agreement_id: string
  accepted_at: string
  terms_snapshot: {
    accounts: { platform: string; account_name: string; status: EcommerceAccountStatus }[]
    services: { service: string | null; ecommerce_account: string | null; agreed_price: number | null; currency: string; billing_type: BillingType }[]
  }
}

export interface Invite {
  id: string
  email: string
  role: AppRole
  full_name: string | null
  job_title: string | null
  department_ids: string[]
  client_id: string | null
  expires_at: string
  used_at: string | null
  cancelled_at: string | null
  created_at: string
}

export interface Task {
  id: string
  task_number: number          // shown as GP-<n> (migration 010)
  client_id: string
  title: string
  description: string | null
  type: TaskType
  status: TaskStatus
  priority: TaskPriority
  is_urgent: boolean
  source: TaskSource
  department_id: string | null
  platform_id: string | null
  service_id: string | null
  due_date: string | null
  deadline_type: DeadlineType | null
  estimated_hours: number | null
  actual_hours: number | null
  created_by: string | null
  assignee_id: string | null
  assigned_by: string | null
  assigned_at: string | null
  parent_task_id: string | null
  ticket_id: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

/** Task with the joins most list views select (see lib/queries.ts TASK_LIST_SELECT). */
export interface TaskListItem extends Task {
  client: { id: string; company_name: string } | null
  platform: { id: string; name: string } | null
  department: { id: string; name: string } | null
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string | null
  body: string
  is_internal: boolean
  created_at: string
}

export interface TaskChecklistItem {
  id: string
  task_id: string
  text: string
  is_done: boolean
  sort_order: number
  created_by: string | null
  created_at: string
}

/** Shared shape for activity-timeline rows — ActivityTimeline renders either kind. */
export interface ActivityEntry {
  id: string
  actor_id: string | null
  action: string
  old_value: string | null
  new_value: string | null
  is_client_visible: boolean
  created_at: string
}

export interface TaskActivity extends ActivityEntry {
  task_id: string
}

export interface TimeLog {
  id: string
  task_id: string
  profile_id: string
  hours: number
  logged_date: string
  notes: string | null
  created_at: string
}

export interface Ticket {
  id: string
  ticket_number: number         // shown as TK-<n>
  client_id: string
  ecommerce_account_id: string | null
  category: TicketCategory
  subject: string
  description: string | null
  details: Record<string, unknown>
  priority: TaskPriority | null
  is_urgent: boolean
  status: TicketStatus
  department_id: string | null
  assignee_id: string | null
  assigned_by: string | null
  assigned_at: string | null
  created_by: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface TicketComment {
  id: string
  ticket_id: string
  author_id: string | null
  body: string
  is_internal: boolean
  created_at: string
}

export interface TicketActivity extends ActivityEntry {
  ticket_id: string
}

export interface TicketAttachment {
  id: string
  ticket_id: string
  uploaded_by: string | null
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export interface Notification {
  id: string
  recipient_id: string
  type: string
  title: string
  body: string | null
  task_id: string | null
  ticket_id: string | null
  client_id: string | null
  is_read: boolean
  created_at: string
}
