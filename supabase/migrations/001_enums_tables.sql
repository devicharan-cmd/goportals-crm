-- ============================================================
-- GoPortals CRM — schema v2 (1/4): enums + tables
-- Run in order on a FRESH Supabase project:
--   001_enums_tables.sql → 002_functions_triggers.sql → 003_rls.sql → 004_seed.sql
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────
create type app_role              as enum ('super_admin', 'manager', 'employee', 'client');
create type account_status        as enum ('pending', 'active', 'suspended', 'rejected');
create type signup_source         as enum ('self_signup', 'admin_created', 'invite');
create type client_stage          as enum ('onboarding', 'setup', 'scale', 'retention', 'churned');
create type platform_category     as enum ('marketplace', 'quick_commerce', 'd2c', 'other');
create type client_service_status as enum ('requested', 'active', 'stopped');
create type task_status           as enum ('open', 'in_progress', 'in_review', 'blocked', 'done');
create type task_priority         as enum ('P1', 'P2', 'P3', 'P4');
create type task_type             as enum ('task', 'issue', 'request', 'grievance');
create type task_source           as enum ('internal', 'client');
create type deadline_type         as enum ('today', 'this_week', 'this_month');

-- ─── People & access ─────────────────────────────────────────
-- One row per login. Single source of truth for role + account status.
create table profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  full_name             text not null default '',
  phone                 text,
  role                  app_role not null default 'client',
  status                account_status not null default 'pending',
  signup_source         signup_source,
  job_title             text,                       -- e.g. 'Team Lead', 'Ads Executive'
  weekly_capacity_hours integer not null default 40 check (weekly_capacity_hours > 0),
  avatar_url            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Managers see/assign within the departments they belong to.
create table department_members (
  department_id uuid not null references departments(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  is_lead       boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (department_id, profile_id)
);

-- ─── Master data (editable by super_admin) ──────────────────
create table platforms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  category   platform_category not null default 'marketplace',
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  department_id uuid references departments(id) on delete set null,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ─── Clients ─────────────────────────────────────────────────
create table clients (
  id                  uuid primary key default gen_random_uuid(),
  company_name        text not null check (length(trim(company_name)) > 0),
  gstin               text,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  whatsapp_group_link text,
  owner_id            uuid unique references profiles(id) on delete set null,  -- the one client login
  status              account_status not null default 'pending',
  stage               client_stage not null default 'onboarding',
  signup_source       signup_source not null,
  approved_by         uuid references profiles(id) on delete set null,
  approved_at         timestamptz,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Staff-only commercial data, kept out of `clients` so the client login can never read it.
create table client_internal (
  client_id        uuid primary key references clients(id) on delete cascade,
  health_score     integer not null default 70 check (health_score between 0 and 100),
  contract_start   date,
  contract_end     date,
  monthly_retainer numeric(12,2) check (monthly_retainer >= 0),
  notes            text,
  updated_at       timestamptz not null default now()
);

create table client_platforms (
  client_id      uuid not null references clients(id) on delete cascade,
  platform_id    uuid not null references platforms(id) on delete restrict,
  seller_id      text,
  total_listings integer not null default 0 check (total_listings >= 0),
  live_listings  integer not null default 0 check (live_listings >= 0),
  created_at     timestamptz not null default now(),
  primary key (client_id, platform_id)
);

create table client_services (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  service_id  uuid references services(id) on delete restrict,
  custom_name text,                                  -- "service not listed" free text
  status      client_service_status not null default 'requested',
  created_at  timestamptz not null default now(),
  check (service_id is not null or length(trim(coalesce(custom_name, ''))) > 0),
  unique (client_id, service_id)
);

-- Which staff handle which client, per department.
create table client_team (
  client_id     uuid not null references clients(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (client_id, profile_id, department_id)
);

-- ─── Agreement & invites ─────────────────────────────────────
create table agreements (
  id           uuid primary key default gen_random_uuid(),
  version      text not null unique,
  title        text not null,
  body         text not null,                        -- markdown
  is_current   boolean not null default false,
  published_at timestamptz,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index agreements_one_current on agreements (is_current) where is_current;

-- Legal record: insert-only (via accept_agreement RPC).
create table agreement_acceptances (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  agreement_id uuid not null references agreements(id) on delete restrict,
  accepted_at  timestamptz not null default now(),
  ip           text,
  user_agent   text,
  unique (profile_id, agreement_id)
);

-- Created by super_admin before sending the Supabase invite email.
-- handle_new_user() reads this to decide the new login's role — never user_metadata.
create table invites (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  role           app_role not null,
  full_name      text,
  job_title      text,
  department_ids uuid[] not null default '{}',       -- staff: departments to join
  client_id      uuid references clients(id) on delete cascade,  -- client: pre-created company (admin_created)
  invited_by     uuid references profiles(id) on delete set null,
  token          uuid not null unique default gen_random_uuid(),
  expires_at     timestamptz not null default now() + interval '14 days',
  used_at        timestamptz,
  used_by        uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index invites_email_idx on invites (lower(email)) where used_at is null;

-- ─── Tasks ───────────────────────────────────────────────────
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  description     text,
  type            task_type not null default 'task',
  status          task_status not null default 'open',
  priority        task_priority not null default 'P3',
  is_urgent       boolean not null default false,
  source          task_source not null default 'internal',
  department_id   uuid references departments(id) on delete set null,
  platform_id     uuid references platforms(id) on delete set null,
  service_id      uuid references services(id) on delete set null,
  due_date        date,
  deadline_type   deadline_type,
  estimated_hours numeric(6,2) default 3 check (estimated_hours >= 0),
  actual_hours    numeric(6,2) check (actual_hours >= 0),
  created_by      uuid references profiles(id) on delete set null,
  assignee_id     uuid references profiles(id) on delete set null,
  assigned_by     uuid references profiles(id) on delete set null,
  assigned_at     timestamptz,
  parent_task_id  uuid references tasks(id) on delete set null,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tasks_client_idx     on tasks (client_id);
create index tasks_assignee_idx   on tasks (assignee_id);
create index tasks_department_idx on tasks (department_id);
create index tasks_status_idx     on tasks (status);
create index tasks_urgent_idx     on tasks (created_at) where is_urgent and status <> 'done';

create table task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  body        text not null check (length(trim(body)) > 0),
  is_internal boolean not null default true,         -- forced false for client authors
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index task_comments_task_idx on task_comments (task_id);

-- Files live in Storage bucket 'task-files' at '<task_id>/<file>'.
create table task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  uploaded_by  uuid references profiles(id) on delete set null,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
create index task_attachments_task_idx on task_attachments (task_id);

-- Written only by trigger (log_task_activity).
create table task_activity (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  actor_id          uuid references profiles(id) on delete set null,
  action            text not null,
  old_value         text,
  new_value         text,
  is_client_visible boolean not null default false,
  created_at        timestamptz not null default now()
);
create index task_activity_task_idx on task_activity (task_id, created_at);

create table time_logs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  hours       numeric(5,2) not null check (hours > 0 and hours <= 24),
  logged_date date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);
create index time_logs_task_idx on time_logs (task_id);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type         text not null,
  title        text not null,
  body         text,
  task_id      uuid references tasks(id) on delete cascade,
  client_id    uuid references clients(id) on delete cascade,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on notifications (recipient_id, is_read, created_at desc);
