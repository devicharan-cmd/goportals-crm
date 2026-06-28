// ============================================================
// AGENCY CRM — Shared TypeScript Types
// ============================================================

export type LifecycleStage = 'onboarding' | 'setup' | 'scale' | 'retention' | 'churned'
export type ServiceType = 'onboarding_setup' | 'full_account_management' | 'ads_only'
export type MemberRole = 'admin' | 'team_lead' | 'member'
export type TicketStatus = 'open' | 'in_progress' | 'in_review' | 'done' | 'blocked'
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4'
export type TicketType = 'task' | 'issue' | 'request' | 'grievance'
export type Platform = 'amazon' | 'flipkart' | 'myntra' | 'blinkit' | 'meesho' | 'nykaa' | 'other'
export type WorkRole = 'ads_management' | 'operations' | 'reporting_grievance' | 'setup_listing'
export type NotificationType =
  | 'ticket_assigned'
  | 'ticket_due_soon'
  | 'ticket_overdue'
  | 'stage_changed'
  | 'sla_breach'
  | 'renewal_due'
  | 'comment_added'

// ============================================================
// DATABASE MODELS
// ============================================================

export interface TeamMember {
  id: string
  user_id: string | null
  name: string
  email: string
  role: MemberRole
  department: string | null
  weekly_capacity_hours: number
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  industry: string | null
  service_type: ServiceType
  lifecycle_stage: LifecycleStage
  health_score: number | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  whatsapp_group_link: string | null
  contract_start: string | null
  contract_end: string | null
  monthly_retainer: number | null
  primary_member_id: string | null
  secondary_member_id: string | null
  primary_work_role: WorkRole | null
  secondary_work_role: WorkRole | null
  platforms: Platform[]
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Joins
  primary_member?: TeamMember
  secondary_member?: TeamMember
}

export interface Ticket {
  id: string
  title: string
  description: string | null
  client_id: string
  assignee_id: string | null
  reporter_id: string | null
  type: TicketType
  status: TicketStatus
  priority: TicketPriority
  platform: Platform | null
  external_ref: string | null
  due_date: string | null
  estimated_hours: number
  actual_hours: number | null
  parent_ticket_id: string | null
  is_auto_generated: boolean
  created_at: string
  updated_at: string
  closed_at: string | null
  // Joins
  client?: Client
  assignee?: TeamMember
  reporter?: TeamMember
  comments?: Comment[]
  sub_tickets?: Ticket[]
}

export interface Comment {
  id: string
  ticket_id: string
  author_id: string | null
  content: string
  created_at: string
  updated_at: string
  // Joins
  author?: TeamMember
}

export interface TimeLog {
  id: string
  ticket_id: string
  member_id: string
  hours: number
  logged_date: string
  notes: string | null
  created_at: string
}

export interface ActivityLog {
  id: string
  ticket_id: string | null
  client_id: string | null
  actor_id: string | null
  action: string
  old_value: string | null
  new_value: string | null
  created_at: string
  actor?: TeamMember
}

export interface Notification {
  id: string
  recipient_id: string
  type: NotificationType
  title: string
  body: string | null
  ticket_id: string | null
  client_id: string | null
  is_read: boolean
  created_at: string
}

// ============================================================
// UI / HELPER TYPES
// ============================================================

export interface MemberWorkload {
  member: TeamMember
  assigned_tickets: Ticket[]
  used_hours: number
  capacity_hours: number
  utilization_pct: number
}

export interface ClientStats {
  client: Client
  open_tickets: number
  overdue_tickets: number
  completed_this_month: number
  health_score: number
}

export interface ReportSummary {
  period: string
  total_tickets: number
  closed_tickets: number
  sla_met: number
  avg_resolution_days: number
  member_breakdown: {
    member: TeamMember
    closed: number
    open: number
    overdue: number
  }[]
}

// ============================================================
// FORM INPUT TYPES
// ============================================================

export interface CreateClientInput {
  name: string
  industry?: string
  service_type: ServiceType
  lifecycle_stage: LifecycleStage
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  contract_start?: string
  contract_end?: string
  monthly_retainer?: number
  primary_member_id?: string
  secondary_member_id?: string
  primary_work_role?: WorkRole
  secondary_work_role?: WorkRole
  platforms?: Platform[]
  notes?: string
}

export interface CreateTicketInput {
  title: string
  description?: string
  client_id: string
  assignee_id?: string
  type: TicketType
  priority: TicketPriority
  platform?: Platform
  external_ref?: string
  due_date?: string
  estimated_hours?: number
  parent_ticket_id?: string
}

// ============================================================
// SERVICE TYPE → WORK ROLE MAPPING
// ============================================================

export const SERVICE_TYPE_ROLES: Record<ServiceType, { primary: WorkRole; secondary: WorkRole }> = {
  onboarding_setup: {
    primary: 'setup_listing',
    secondary: 'reporting_grievance',
  },
  full_account_management: {
    primary: 'ads_management',
    secondary: 'operations',
  },
  ads_only: {
    primary: 'ads_management',
    secondary: 'reporting_grievance',
  },
}

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  onboarding_setup: 'Onboarding & Setup',
  full_account_management: 'Full Account Management',
  ads_only: 'Ads Only',
}

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  onboarding: 'Onboarding',
  setup: 'Setup',
  scale: 'Scale',
  retention: 'Retention',
  churned: 'Churned',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  myntra: 'Myntra',
  blinkit: 'Blinkit',
  meesho: 'Meesho',
  nykaa: 'Nykaa',
  other: 'Other',
}

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  P1: 'text-red-500 bg-red-50',
  P2: 'text-orange-500 bg-orange-50',
  P3: 'text-blue-500 bg-blue-50',
  P4: 'text-gray-500 bg-gray-50',
}

export const STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'text-gray-600 bg-gray-100',
  in_progress: 'text-blue-600 bg-blue-100',
  in_review: 'text-purple-600 bg-purple-100',
  done: 'text-green-600 bg-green-100',
  blocked: 'text-red-600 bg-red-100',
}
