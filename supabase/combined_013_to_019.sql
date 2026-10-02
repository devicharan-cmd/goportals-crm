-- ============================================================
-- Combined update: migrations 013-019 in one script.
-- Every statement is idempotent — safe to run on a fresh database
-- (never had 013-019 applied) AND safe to re-run on one that
-- already has them, without erroring either way.
-- Does NOT include 012_seed_test_data.sql (optional demo data).
-- ============================================================


-- ################################################################
-- #### 013_ecommerce_accounts.sql
-- ################################################################

-- ============================================================
-- 013: client_platforms → ecommerce_accounts
--   A client can now have MULTIPLE accounts on the SAME platform
--   (e.g. two Amazon seller accounts), each with its own stable id,
--   name, external seller/merchant id, status, etc.
--   Evolves the existing client_platforms table in place rather than
--   adding a parallel table — it already held per-(client,platform)
--   account data (seller_id, listing counts), just without the
--   surrogate key needed to allow more than one row per platform.
-- Safe to re-run: guards re-creation of things that already exist.
-- ============================================================

do $$ begin
  create type ecommerce_account_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

-- Only rename if this hasn't already run (re-running after a prior successful
-- apply must not fail just because client_platforms is gone — it's gone
-- because this already worked).
do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'client_platforms')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ecommerce_accounts') then
    alter table client_platforms rename to ecommerce_accounts;
  end if;
end $$;

alter table ecommerce_accounts drop constraint if exists client_platforms_pkey;

alter table ecommerce_accounts
  add column if not exists id           uuid default gen_random_uuid(),
  add column if not exists account_name text,
  add column if not exists store_url    text,
  add column if not exists country      text,
  add column if not exists currency     text,
  add column if not exists status       ecommerce_account_status not null default 'active',
  add column if not exists created_by   uuid references profiles(id) on delete set null,
  add column if not exists updated_at   timestamptz not null default now();

-- Backfill a sensible default name for existing rows: "<Client> <Platform>".
update ecommerce_accounts ea
set account_name = c.company_name || ' ' || p.name
from clients c, platforms p
where ea.client_id = c.id and ea.platform_id = p.id and ea.account_name is null;

alter table ecommerce_accounts alter column account_name set not null;

do $$ begin
  alter table ecommerce_accounts add constraint ecommerce_accounts_name_nonempty check (length(trim(account_name)) > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ecommerce_accounts add constraint ecommerce_accounts_listings_sane check (live_listings <= total_listings);
exception when duplicate_object then null; end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'ecommerce_accounts'::regclass and contype = 'p'
  ) then
    alter table ecommerce_accounts add primary key (id);
  end if;
end $$;

-- A named UNIQUE constraint backs itself with a same-named index, so a repeat
-- run can fail with either duplicate_object (42710) or duplicate_table (42P07,
-- Postgres treats the index as a relation) depending on exactly what already
-- exists — catch both.
do $$ begin
  alter table ecommerce_accounts
    add constraint ecommerce_accounts_client_platform_name_uniq unique (client_id, platform_id, account_name);
exception when duplicate_object or duplicate_table then null; end $$;

create unique index if not exists ecommerce_accounts_platform_seller_uniq
  on ecommerce_accounts (platform_id, seller_id) where seller_id is not null;

create index if not exists ecommerce_accounts_client_idx        on ecommerce_accounts (client_id);
create index if not exists ecommerce_accounts_platform_idx      on ecommerce_accounts (platform_id);
create index if not exists ecommerce_accounts_client_status_idx on ecommerce_accounts (client_id, status);

drop trigger if exists ecommerce_accounts_set_updated_at on ecommerce_accounts;
create trigger ecommerce_accounts_set_updated_at
  before update on ecommerce_accounts for each row execute function set_updated_at();

-- ─── RLS: same predicates as client_platforms had, renamed onto the new table ───
drop policy if exists client_platforms_select on ecommerce_accounts;
drop policy if exists client_platforms_write  on ecommerce_accounts;
drop policy if exists ecommerce_accounts_select on ecommerce_accounts;
drop policy if exists ecommerce_accounts_write  on ecommerce_accounts;

create policy ecommerce_accounts_select on ecommerce_accounts for select to authenticated
  using (is_super_admin() or auth_role() = 'manager' or client_id = my_client_id());
create policy ecommerce_accounts_write  on ecommerce_accounts for all    to authenticated
  using (is_super_admin() or manager_covers_client(client_id))
  with check (is_super_admin() or manager_covers_client(client_id));

-- ─── save_client_onboarding(): point at ecommerce_accounts ───
-- Only touches accounts the client self-selected (created_by = the client's own
-- login); accounts an admin has already set up for the client are left alone,
-- and a platform that already has any account (self- or admin-created) is not
-- given a second generic placeholder.
create or replace function public.save_client_onboarding(
  p_company          jsonb,     -- {company_name, gstin, contact_name, contact_email, contact_phone}
  p_platform_ids     uuid[],
  p_service_ids      uuid[],
  p_custom_services  text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile   profiles%rowtype;
  v_client_id uuid;
  v_status    account_status;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'client' then
    raise exception 'Only client accounts can complete onboarding';
  end if;
  if length(trim(coalesce(p_company->>'company_name', ''))) = 0 then
    raise exception 'Company name is required';
  end if;

  select id, status into v_client_id, v_status from clients where owner_id = auth.uid();

  if v_client_id is null then
    insert into clients (company_name, gstin, contact_name, contact_email, contact_phone,
                         owner_id, status, signup_source, created_by)
    values (trim(p_company->>'company_name'),
            nullif(trim(p_company->>'gstin'), ''),
            coalesce(nullif(trim(p_company->>'contact_name'), ''), nullif(v_profile.full_name, '')),
            coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
            nullif(trim(p_company->>'contact_phone'), ''),
            auth.uid(), 'pending', coalesce(v_profile.signup_source, 'self_signup'), auth.uid())
    returning id into v_client_id;
  elsif v_status = 'pending' then
    update clients set
      company_name  = trim(p_company->>'company_name'),
      gstin         = nullif(trim(p_company->>'gstin'), ''),
      contact_name  = nullif(trim(p_company->>'contact_name'), ''),
      contact_email = coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
      contact_phone = nullif(trim(p_company->>'contact_phone'), '')
    where id = v_client_id;
  else
    raise exception 'Your account is already set up — contact your account manager to change these details';
  end if;

  -- Platforms: replace the client's own self-selected accounts.
  delete from ecommerce_accounts
  where client_id = v_client_id
    and created_by = auth.uid()
    and not (platform_id = any (coalesce(p_platform_ids, '{}')));

  insert into ecommerce_accounts (client_id, platform_id, account_name, created_by)
  select v_client_id, p.id, p.name, auth.uid() from platforms p
  where p.is_active and p.id = any (coalesce(p_platform_ids, '{}'))
    and not exists (
      select 1 from ecommerce_accounts ea
      where ea.client_id = v_client_id and ea.platform_id = p.id
    );

  -- Services: replace requested ones (active/stopped ones are managed by staff)
  delete from client_services where client_id = v_client_id and status = 'requested';
  insert into client_services (client_id, service_id)
  select v_client_id, s.id from services s
  where s.is_active and s.id = any (coalesce(p_service_ids, '{}'))
  on conflict (client_id, service_id) do nothing;
  insert into client_services (client_id, custom_name)
  select v_client_id, trim(c) from unnest(coalesce(p_custom_services, '{}')) c
  where length(trim(c)) > 0;

  return v_client_id;
end $$;


-- ################################################################
-- #### 014_tickets.sql
-- ################################################################

-- ============================================================
-- 014: Client-facing tickets, split out from internal tasks.
--   • tickets: what a client submits (category-based, structured `details` jsonb —
--     NOT an EAV field system, since the 10 categories/fields are fixed and code-owned,
--     not admin-configurable at runtime).
--   • tasks.ticket_id: a ticket may spawn many internal tasks; a task may exist with none.
--   • Clients lose direct read/write access to `tasks` — that channel is replaced by tickets.
-- Safe to re-run.
-- ============================================================

-- ─── Category enum ───────────────────────────────────────────
do $$ begin
  create type ticket_category as enum (
    'new_listing', 'active_product_change', 'price_updation', 'inventory_update',
    'ads_campaign', 'shipment', 'complaint', 'new_expansion', 'report', 'other'
  );
exception when duplicate_object then null; end $$;

-- ─── tickets ─────────────────────────────────────────────────
create sequence if not exists ticket_number_seq start 1001;

create table if not exists tickets (
  id                   uuid primary key default gen_random_uuid(),
  ticket_number        bigint not null default nextval('ticket_number_seq'),
  client_id            uuid not null references clients(id) on delete cascade,
  ecommerce_account_id uuid references ecommerce_accounts(id) on delete set null,
  category             ticket_category not null,
  subject              text not null check (length(trim(subject)) > 0),
  description          text,
  details              jsonb not null default '{}',  -- category-specific fields; see guard_ticket_details()
  priority             task_priority,                -- null = client left it unset, staff decides
  status               task_status not null default 'open',
  department_id        uuid references departments(id) on delete set null,   -- set by staff during triage
  assignee_id          uuid references profiles(id) on delete set null,
  assigned_by          uuid references profiles(id) on delete set null,
  assigned_at          timestamptz,
  created_by           uuid references profiles(id) on delete set null,
  closed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint tickets_report_needs_account check (category <> 'report' or ecommerce_account_id is not null)
);
alter sequence ticket_number_seq owned by tickets.ticket_number;
grant usage, select on sequence ticket_number_seq to authenticated, service_role;

create unique index if not exists tickets_ticket_number_key on tickets (ticket_number);
create index if not exists tickets_client_idx     on tickets (client_id);
create index if not exists tickets_assignee_idx   on tickets (assignee_id);
create index if not exists tickets_department_idx on tickets (department_id);
create index if not exists tickets_status_idx     on tickets (status);
create index if not exists tickets_account_idx    on tickets (ecommerce_account_id);

create table if not exists ticket_comments (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  body        text not null check (length(trim(body)) > 0),
  is_internal boolean not null default true,      -- forced false for client authors (guard_comment_write, reused)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ticket_comments_ticket_idx on ticket_comments (ticket_id);

-- Files live in Storage bucket 'ticket-files' at '<ticket_id>/<file>'.
create table if not exists ticket_attachments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets(id) on delete cascade,
  uploaded_by  uuid references profiles(id) on delete set null,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
create index if not exists ticket_attachments_ticket_idx on ticket_attachments (ticket_id);

-- A ticket may spawn several tasks; a task may exist without a ticket.
alter table tasks add column if not exists ticket_id uuid references tickets(id) on delete set null;
create index if not exists tasks_ticket_idx on tasks (ticket_id);

alter table notifications add column if not exists ticket_id uuid references tickets(id) on delete cascade;
create index if not exists notifications_ticket_idx on notifications (ticket_id);

-- ─── Ticket number: fixed at creation ────────────────────────
create or replace function public.keep_ticket_number() returns trigger
language plpgsql as $$
begin
  new.ticket_number := old.ticket_number;
  return new;
end $$;

drop trigger if exists tickets_0_keep_number on tickets;
create trigger tickets_0_keep_number before update on tickets
  for each row execute function keep_ticket_number();

-- Defensive: defined in 007_manager_sees_employee_tasks.sql, but re-declared here
-- (CREATE OR REPLACE, identical body) so this migration doesn't depend on 007
-- having actually run first.
create or replace function public.is_employee(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile_id is not null
     and exists (select 1 from profiles where id = p_profile_id and role = 'employee')
$$;

-- ─── Visibility (mirrors task_visible(), no is_urgent concept on tickets) ─
create or replace function public.ticket_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid, p_created_by uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'manager' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
      or is_employee(p_assignee_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select ticket_visible(t.client_id, t.department_id, t.assignee_id, t.created_by)
    from tickets t where t.id = p_ticket_id
  ), false)
$$;

-- ─── Required fields per category, enforced in the DB (not just the form) ─
create or replace function public.guard_ticket_details() returns trigger
language plpgsql as $$
declare
  v_required text[];
  v_missing  text;
  v_desc_required boolean;
begin
  v_required := case new.category
    when 'new_listing'           then array['product_name', 'sku', 'product_category']
    when 'active_product_change' then array['sku', 'change_type', 'new_value']
    when 'price_updation'        then array['sku', 'new_price', 'currency']
    when 'inventory_update'      then array['sku', 'new_quantity']
    when 'ads_campaign'          then array['request_type']
    when 'shipment'              then array['issue_type']
    when 'complaint'             then array['complaint_type']
    when 'new_expansion'         then array['expansion_type', 'requirements']
    when 'report'                then array['report_type', 'date_from', 'date_to']
    else array[]::text[]  -- 'other': subject + description (top-level columns) are enough
  end;

  select string_agg(k, ', ') into v_missing
  from unnest(v_required) k
  where not (new.details ? k) or trim(new.details->>k) = '';

  if v_missing is not null then
    raise exception 'Missing required field(s) for category %: %', new.category, v_missing;
  end if;

  v_desc_required := new.category in
    ('new_listing', 'active_product_change', 'ads_campaign', 'shipment', 'complaint', 'new_expansion', 'other');
  if v_desc_required and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required for this ticket category';
  end if;

  return new;
end $$;

drop trigger if exists tickets_guard_details on tickets;
create trigger tickets_guard_details before insert or update of category, details, description on tickets
  for each row execute function guard_ticket_details();

-- ─── Permissions per role (mirrors guard_task_write) ─────────
create or replace function public.guard_ticket_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_in_scope boolean;
begin
  if v_uid is null then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    if v_role = 'client' then
      new.client_id     := my_client_id();
      new.status        := 'open';
      new.assignee_id   := null;
      new.assigned_by   := null;
      new.assigned_at   := null;
      new.department_id := null;
    elsif new.assignee_id is not null then
      if not can_assign(new.assignee_id) then
        raise exception 'You cannot assign tickets to this person';
      end if;
      new.assigned_by := v_uid;
      new.assigned_at := now();
    end if;

    if new.ecommerce_account_id is not null and not exists (
      select 1 from ecommerce_accounts ea
      where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
    ) then
      raise exception 'That e-commerce account does not belong to this client';
    end if;

    return new;
  end if;

  -- UPDATE
  if v_role = 'client' then
    if coalesce(old.created_by <> v_uid, true) or old.status <> 'open' then
      raise exception 'You can only edit your own tickets while they are still open';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new),
         array['subject', 'description', 'details', 'priority', 'ecommerce_account_id', 'updated_at']) then
      raise exception 'You can only change the subject, description, details, priority and e-commerce account';
    end if;

  elsif v_role = 'employee' then
    if not (coalesce(old.assignee_id = v_uid, false) or coalesce(old.created_by = v_uid, false)) then
      raise exception 'You can only update tickets assigned to you';
    end if;

  elsif v_role = 'manager' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id)
               or is_employee(old.assignee_id);
    if not v_in_scope then
      raise exception 'This ticket is outside your scope';
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tickets to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  if new.ecommerce_account_id is not null and not exists (
    select 1 from ecommerce_accounts ea
    where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
  ) then
    raise exception 'That e-commerce account does not belong to this client';
  end if;

  return new;
end $$;

drop trigger if exists tickets_a_guard      on tickets;
drop trigger if exists tickets_b_closed_at  on tickets;
drop trigger if exists tickets_c_updated_at on tickets;
create trigger tickets_a_guard      before insert or update on tickets for each row execute function guard_ticket_write();
create trigger tickets_b_closed_at  before insert or update on tickets for each row execute function set_closed_at();
create trigger tickets_c_updated_at before update on tickets           for each row execute function set_updated_at();

-- ticket_comments reuse the exact same generic guard/trigger already used by task_comments.
drop trigger if exists ticket_comments_guard      on ticket_comments;
drop trigger if exists ticket_comments_updated_at on ticket_comments;
create trigger ticket_comments_guard      before insert or update on ticket_comments for each row execute function guard_comment_write();
create trigger ticket_comments_updated_at before update on ticket_comments           for each row execute function set_updated_at();

-- ─── Notifications ────────────────────────────────────────────
create or replace function public.notify_ticket_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    select p.id, 'client_ticket',
           'TK-' || new.ticket_number || ': New ' || replace(new.category::text, '_', ' ') || ' request from '
             || (select company_name from clients where id = new.client_id),
           new.subject, new.id, new.client_id
    from profiles p
    where p.status = 'active'
      and (p.role = 'super_admin'
           or (p.role = 'manager' and new.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = new.department_id)));
  end if;

  if new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.assignee_id, 'assigned', 'TK-' || new.ticket_number || ': Ticket assigned to you', new.subject, new.id, new.client_id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.created_by, 'status_changed',
            'TK-' || new.ticket_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.subject, new.id, new.client_id);
  end if;

  return null;
end $$;

drop trigger if exists tickets_notify on tickets;
create trigger tickets_notify after insert or update on tickets
  for each row execute function notify_ticket_change();

create or replace function public.notify_ticket_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t           tickets%rowtype;
  v_author    uuid := new.author_id;
  v_author_nm text;
  v_is_client boolean;
  v_title     text;
  v_body      text := left(new.body, 140);
begin
  select * into t from tickets where id = new.ticket_id;
  if t.id is null then return null; end if;

  select coalesce(nullif(full_name, ''), email), role = 'client'
    into v_author_nm, v_is_client
  from profiles where id = v_author;
  v_title := 'TK-' || t.ticket_number || ': ' || coalesce(v_author_nm, 'Someone') || ' commented on "' || left(t.subject, 60) || '"';

  insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
  select distinct r.id, 'comment', v_title, v_body, t.id, t.client_id
  from (
    select t.assignee_id as id
    union
    select t.created_by
    where t.created_by is not null
      and (not new.is_internal
           or not exists (select 1 from profiles where id = t.created_by and role = 'client'))
    union
    select p.id from profiles p
    where coalesce(v_is_client, false) and t.assignee_id is null and p.status = 'active'
      and (p.role = 'super_admin'
           or (p.role = 'manager' and t.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = t.department_id)))
  ) r
  join profiles p on p.id = r.id and p.status = 'active'
  where r.id is not null
    and r.id is distinct from v_author;

  return null;
end $$;

drop trigger if exists ticket_comments_notify on ticket_comments;
create trigger ticket_comments_notify after insert on ticket_comments
  for each row execute function notify_ticket_comment();

-- ─── Tickets replace the client's direct write channel into tasks ────
-- tasks: clients can no longer create/see them at all; a client's work items
-- now live in `tickets`, and staff optionally link internal tasks to a ticket.
create or replace function public.task_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid,
  p_created_by uuid, p_is_urgent boolean, p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'manager' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
      or is_employee(p_assignee_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
    else false  -- 'client': no direct task access any more — see tickets
  end, false)
$$;

create or replace function public.guard_task_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
begin
  if v_uid is null then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if v_role = 'client' then
    raise exception 'Clients cannot create or edit tasks directly — submit a ticket instead';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;
    new.source := 'internal';
    if new.is_urgent and v_role = 'employee' then
      raise exception 'Only managers and admins can mark tasks urgent';
    end if;
    if new.assignee_id is not null then
      if not can_assign(new.assignee_id) then
        raise exception 'You cannot assign tasks to this person';
      end if;
      new.assigned_by := v_uid;
      new.assigned_at := now();
    end if;
    if new.department_id is null and new.service_id is not null then
      new.department_id := (select department_id from services where id = new.service_id);
    end if;
    return new;
  end if;

  -- UPDATE
  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status <> 'done'
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'employee' then
    if not v_is_claim then
      if not (coalesce(old.assignee_id = v_uid, false) or coalesce(old.created_by = v_uid, false)) then
        raise exception 'You can only update tasks assigned to you';
      end if;
      if new.is_urgent is distinct from old.is_urgent then
        raise exception 'Only managers and admins can mark tasks urgent';
      end if;
    end if;

  elsif v_role = 'manager' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id)
               or is_employee(old.assignee_id);
    if not v_in_scope and not v_is_claim then
      raise exception 'This task is outside your scope — you can only claim it if it is urgent and unassigned';
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tasks to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  return new;
end $$;

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert to authenticated
  with check (is_staff());

-- ─── RLS: tickets and children ────────────────────────────────
alter table tickets            enable row level security;
alter table ticket_comments    enable row level security;
alter table ticket_attachments enable row level security;

drop policy if exists tickets_select on tickets;
drop policy if exists tickets_insert on tickets;
drop policy if exists tickets_update on tickets;
drop policy if exists tickets_delete on tickets;
create policy tickets_select on tickets for select to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by));
create policy tickets_insert on tickets for insert to authenticated
  with check (is_staff() or (auth_role() = 'client' and client_id = my_client_id()));
create policy tickets_update on tickets for update to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by))
  with check (true);  -- column-level rules enforced by guard_ticket_write
create policy tickets_delete on tickets for delete to authenticated
  using (is_super_admin());

drop policy if exists ticket_comments_select on ticket_comments;
drop policy if exists ticket_comments_insert on ticket_comments;
drop policy if exists ticket_comments_update on ticket_comments;
drop policy if exists ticket_comments_delete on ticket_comments;
create policy ticket_comments_select on ticket_comments for select to authenticated
  using (can_see_ticket(ticket_id) and (is_staff() or not is_internal));
create policy ticket_comments_insert on ticket_comments for insert to authenticated
  with check (author_id = auth.uid() and can_see_ticket(ticket_id) and (is_staff() or not is_internal));
create policy ticket_comments_update on ticket_comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and (is_staff() or not is_internal));
create policy ticket_comments_delete on ticket_comments for delete to authenticated
  using (author_id = auth.uid() or is_super_admin());

drop policy if exists ticket_attachments_select on ticket_attachments;
drop policy if exists ticket_attachments_insert on ticket_attachments;
drop policy if exists ticket_attachments_delete on ticket_attachments;
create policy ticket_attachments_select on ticket_attachments for select to authenticated
  using (can_see_ticket(ticket_id));
create policy ticket_attachments_insert on ticket_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and can_see_ticket(ticket_id));
create policy ticket_attachments_delete on ticket_attachments for delete to authenticated
  using (uploaded_by = auth.uid() or is_super_admin());

-- A staff member who can see a ticket can see the specific account it names,
-- even outside their usual client coverage (needed once tickets, not just
-- client_team membership, are how staff get scoped to a client's accounts).
drop policy if exists ecommerce_accounts_select on ecommerce_accounts;
create policy ecommerce_accounts_select on ecommerce_accounts for select to authenticated
  using (
    is_super_admin() or auth_role() = 'manager' or client_id = my_client_id()
    or exists (select 1 from tickets t where t.ecommerce_account_id = ecommerce_accounts.id and can_see_ticket(t.id))
  );

-- ─── Storage: private bucket, files at '<ticket_id>/<file>' ──
insert into storage.buckets (id, name, public)
values ('ticket-files', 'ticket-files', false)
on conflict (id) do nothing;

drop policy if exists ticket_files_select on storage.objects;
drop policy if exists ticket_files_insert on storage.objects;
drop policy if exists ticket_files_delete on storage.objects;
create policy ticket_files_select on storage.objects for select to authenticated
  using (bucket_id = 'ticket-files'
         and can_see_ticket(try_uuid((storage.foldername(name))[1])));
create policy ticket_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-files'
              and can_see_ticket(try_uuid((storage.foldername(name))[1])));
create policy ticket_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ticket-files'
         and (is_super_admin()
              or exists (select 1 from public.ticket_attachments a
                         where a.storage_path = storage.objects.name
                           and a.uploaded_by = auth.uid())));


-- ################################################################
-- #### 015_client_services_pricing.sql
-- ################################################################

-- ============================================================
-- 015: Per-service pricing, decided by admin/super_admin at assignment time.
--   • services.default_price/default_billing_type — the editable "sticker price".
--   • client_services.agreed_price/billing_type   — frozen at assignment; never
--     rewritten when the service's default price later changes (no sync trigger).
--   • client_services can now optionally tie a service to one specific
--     ecommerce_account (e.g. "Amazon PPC" priced separately per seller account)
--     or leave it client-wide (ecommerce_account_id null).
-- RLS is unchanged: client_services_select/write (003/006) already restrict
-- writes to super_admin/manager and reads to staff-or-owning-client — that
-- covers every new column automatically since it's row-level, not column-level.
-- Safe to re-run.
-- ============================================================

do $$ begin
  create type billing_type as enum ('monthly', 'one_time', 'per_task');
exception when duplicate_object then null; end $$;

alter table services
  add column if not exists default_price        numeric(12,2) check (default_price >= 0),
  add column if not exists default_billing_type billing_type;

alter table client_services
  add column if not exists ecommerce_account_id uuid references ecommerce_accounts(id) on delete cascade,
  add column if not exists agreed_price          numeric(12,2) check (agreed_price >= 0),
  add column if not exists currency              text not null default 'INR',
  add column if not exists billing_type          billing_type not null default 'monthly',
  add column if not exists selected_by           uuid references profiles(id) on delete set null,
  add column if not exists selected_at           timestamptz;

update client_services set selected_at = created_at where selected_at is null;
alter table client_services alter column selected_at set not null,
                             alter column selected_at set default now();

-- Same service can be priced once for the whole client, or once per account —
-- never duplicated either way. (Plain UNIQUE can't do this: NULLs compare distinct.)
alter table client_services drop constraint if exists client_services_client_id_service_id_key;
create unique index if not exists client_services_whole_client_uniq
  on client_services (client_id, service_id) where ecommerce_account_id is null;
create unique index if not exists client_services_per_account_uniq
  on client_services (client_id, service_id, ecommerce_account_id) where ecommerce_account_id is not null;

create index if not exists client_services_account_idx on client_services (ecommerce_account_id);


-- ################################################################
-- #### 016_invites_cancel.sql
-- ################################################################

-- ============================================================
-- 016: Cancelled invites become a soft-cancel, not a hard delete, so a
--   cancelled invite still shows up in history instead of vanishing.
--   Status is never stored (it would just drift out of sync) — it's always
--   derived from the timestamps:
--     cancelled_at set  → cancelled
--     used_at set       → accepted
--     expires_at < now  → expired
--     else              → pending
-- Safe to re-run.
-- ============================================================

alter table invites add column if not exists cancelled_at timestamptz;

-- A cancelled invite must never be silently honoured by handle_new_user().
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
begin
  select * into inv from invites
  where lower(email) = lower(new.email)
    and used_at is null
    and cancelled_at is null
    and expires_at > now()
  order by created_at desc limit 1;

  if inv.id is not null then
    insert into profiles (id, email, full_name, role, status, signup_source, job_title)
    values (
      new.id, new.email,
      coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', ''),
      inv.role,
      case when inv.role = 'client' then 'pending' else 'active' end::account_status,
      case when inv.role = 'client'
           then (case when inv.client_id is null then 'invite' else 'admin_created' end)::signup_source
      end,
      inv.job_title
    );

    insert into department_members (department_id, profile_id)
    select unnest(inv.department_ids), new.id
    on conflict do nothing;

    if inv.role = 'client' and inv.client_id is not null then
      update clients set owner_id = new.id where id = inv.client_id and owner_id is null;
    end if;

    update invites set used_at = now(), used_by = new.id where id = inv.id;
  else
    insert into profiles (id, email, full_name, role, status, signup_source)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
            'client', 'pending', 'self_signup');
  end if;

  return new;
end $$;


-- ################################################################
-- #### 017_client_self_service_and_agreement_snapshot.sql
-- ################################################################

-- ============================================================
-- 017: Client self-service profile + address, and a durable record of what
--   commercial terms an agreement acceptance actually covered.
--
--   Flow this supports:
--     admin/super_admin creates client → sets ecommerce_accounts + client_services
--     (with agreed_price) at creation time → client is invited, logs in, fills in
--     their own basic details + address → sees the current agreement together
--     with the accounts/services/prices already assigned to them → accepts →
--     status becomes active → dashboard.
--   Afterwards the client can only ever edit their own basic details + address —
--   never accounts, services or price (those tables already deny client writes
--   entirely via RLS; this migration only opens a narrow, allow-listed self-edit
--   path on `clients` itself, enforced in the DB, not just hidden in the UI).
-- Safe to re-run.
-- ============================================================

-- ─── Address: map-picked or manually typed ───────────────────
do $$ begin
  create type address_input_method as enum ('map', 'manual');
exception when duplicate_object then null; end $$;

alter table clients
  add column if not exists address_line   text,
  add column if not exists city           text,
  add column if not exists state          text,
  add column if not exists postal_code    text,
  add column if not exists country        text default 'India',
  add column if not exists latitude       double precision,
  add column if not exists longitude      double precision,
  add column if not exists place_id       text,             -- Google Place ID, when picked from the map
  add column if not exists address_source address_input_method;

do $$ begin
  alter table clients add constraint clients_latitude_range check (latitude is null or latitude between -90 and 90);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table clients add constraint clients_longitude_range check (longitude is null or longitude between -180 and 180);
exception when duplicate_object then null; end $$;

-- A map-picked address must carry real coordinates; a manually typed one doesn't have to.
do $$ begin
  alter table clients add constraint clients_map_needs_coords check (
    address_source is distinct from 'map' or (latitude is not null and longitude is not null)
  );
exception when duplicate_object then null; end $$;

-- ─── Client can edit their own basic details + address, nothing commercial ─
drop policy if exists clients_update on clients;
create policy clients_update on clients for update to authenticated
  using (is_super_admin() or manager_covers_client(id) or (auth_role() = 'client' and owner_id = auth.uid()))
  with check (true);  -- column-level enforcement in guard_client_update

create or replace function public.guard_client_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin() then
    return new;
  end if;

  if auth_role() = 'client' then
    if old.owner_id is distinct from auth.uid() then
      raise exception 'You can only edit your own company';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new), array[
      'company_name', 'gstin', 'contact_name', 'contact_email', 'contact_phone', 'whatsapp_group_link',
      'address_line', 'city', 'state', 'postal_code', 'country', 'latitude', 'longitude', 'place_id', 'address_source',
      'updated_at'
    ]) then
      raise exception 'You can only change your company''s basic details and address';
    end if;
    return new;
  end if;

  if new.status        is distinct from old.status
  or new.owner_id      is distinct from old.owner_id
  or new.signup_source is distinct from old.signup_source
  or new.approved_by   is distinct from old.approved_by
  or new.approved_at   is distinct from old.approved_at then
    raise exception 'Only a super admin can change account status, owner or approval';
  end if;
  return new;
end $$;

-- ─── Agreement acceptance: freeze what was actually shown ────
-- client_services.agreed_price already never gets silently rewritten (015), so this
-- is redundant for normal operation — it exists for the case an admin later
-- renegotiates a price: the original signed record must still show the old terms.
alter table agreement_acceptances add column if not exists terms_snapshot jsonb not null default '{}';

create or replace function public.accept_agreement(
  p_agreement_id uuid, p_ip text default null, p_user_agent text default null
) returns account_status
language plpgsql security definer set search_path = public as $$
declare
  v_client   clients%rowtype;
  v_snapshot jsonb;
begin
  select * into v_client from clients where owner_id = auth.uid();
  if v_client.id is null then
    raise exception 'Please complete your company details first';
  end if;
  if not exists (select 1 from agreements where id = p_agreement_id and is_current) then
    raise exception 'This agreement version is no longer current — please reload the page';
  end if;

  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', p.name, 'account_name', ea.account_name, 'status', ea.status
      ))
      from ecommerce_accounts ea join platforms p on p.id = ea.platform_id
      where ea.client_id = v_client.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service', coalesce(s.name, cs.custom_name),
        'ecommerce_account', ea.account_name,
        'agreed_price', cs.agreed_price,
        'currency', cs.currency,
        'billing_type', cs.billing_type
      ))
      from client_services cs
      left join services s on s.id = cs.service_id
      left join ecommerce_accounts ea on ea.id = cs.ecommerce_account_id
      where cs.client_id = v_client.id and cs.status <> 'stopped'
    ), '[]'::jsonb)
  ) into v_snapshot;

  insert into agreement_acceptances (client_id, profile_id, agreement_id, ip, user_agent, terms_snapshot)
  values (v_client.id, auth.uid(), p_agreement_id, p_ip, p_user_agent, v_snapshot)
  on conflict (profile_id, agreement_id) do nothing;

  if v_client.signup_source <> 'self_signup' and v_client.status = 'pending' then
    perform set_config('app.bypass_guard', 'on', true);
    update clients  set status = 'active' where id = v_client.id;
    update profiles set status = 'active' where id = auth.uid() and status = 'pending';
    return 'active';
  end if;

  return v_client.status;
end $$;


-- ################################################################
-- #### 018_onboarding_address.sql
-- ################################################################

-- ============================================================
-- 018: save_client_onboarding() also saves the address, entered during the
--   same step as basic company details. No signature change — address fields
--   just ride along in the existing p_company jsonb (old callers omitting
--   them still work fine, ->>'key' on a missing key is simply null).
-- Safe to re-run.
-- ============================================================

create or replace function public.save_client_onboarding(
  p_company          jsonb,     -- {company_name, gstin, contact_name, contact_email, contact_phone,
                                 --  address_line, city, state, postal_code, country,
                                 --  latitude, longitude, place_id, address_source}
  p_platform_ids     uuid[],
  p_service_ids      uuid[],
  p_custom_services  text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile   profiles%rowtype;
  v_client_id uuid;
  v_status    account_status;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'client' then
    raise exception 'Only client accounts can complete onboarding';
  end if;
  if length(trim(coalesce(p_company->>'company_name', ''))) = 0 then
    raise exception 'Company name is required';
  end if;

  select id, status into v_client_id, v_status from clients where owner_id = auth.uid();

  if v_client_id is null then
    insert into clients (company_name, gstin, contact_name, contact_email, contact_phone,
                         address_line, city, state, postal_code, country, latitude, longitude, place_id, address_source,
                         owner_id, status, signup_source, created_by)
    values (trim(p_company->>'company_name'),
            nullif(trim(p_company->>'gstin'), ''),
            coalesce(nullif(trim(p_company->>'contact_name'), ''), nullif(v_profile.full_name, '')),
            coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
            nullif(trim(p_company->>'contact_phone'), ''),
            nullif(trim(p_company->>'address_line'), ''),
            nullif(trim(p_company->>'city'), ''),
            nullif(trim(p_company->>'state'), ''),
            nullif(trim(p_company->>'postal_code'), ''),
            nullif(trim(p_company->>'country'), ''),
            nullif(p_company->>'latitude', '')::double precision,
            nullif(p_company->>'longitude', '')::double precision,
            nullif(trim(p_company->>'place_id'), ''),
            nullif(p_company->>'address_source', '')::address_input_method,
            auth.uid(), 'pending', coalesce(v_profile.signup_source, 'self_signup'), auth.uid())
    returning id into v_client_id;
  elsif v_status = 'pending' then
    update clients set
      company_name  = trim(p_company->>'company_name'),
      gstin         = nullif(trim(p_company->>'gstin'), ''),
      contact_name  = nullif(trim(p_company->>'contact_name'), ''),
      contact_email = coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
      contact_phone = nullif(trim(p_company->>'contact_phone'), ''),
      address_line  = nullif(trim(p_company->>'address_line'), ''),
      city          = nullif(trim(p_company->>'city'), ''),
      state         = nullif(trim(p_company->>'state'), ''),
      postal_code   = nullif(trim(p_company->>'postal_code'), ''),
      country       = nullif(trim(p_company->>'country'), ''),
      latitude      = nullif(p_company->>'latitude', '')::double precision,
      longitude     = nullif(p_company->>'longitude', '')::double precision,
      place_id      = nullif(trim(p_company->>'place_id'), ''),
      address_source = nullif(p_company->>'address_source', '')::address_input_method
    where id = v_client_id;
  else
    raise exception 'Your account is already set up — contact your account manager to change these details';
  end if;

  -- Platforms: replace the client's own self-selected accounts.
  delete from ecommerce_accounts
  where client_id = v_client_id
    and created_by = auth.uid()
    and not (platform_id = any (coalesce(p_platform_ids, '{}')));

  insert into ecommerce_accounts (client_id, platform_id, account_name, created_by)
  select v_client_id, p.id, p.name, auth.uid() from platforms p
  where p.is_active and p.id = any (coalesce(p_platform_ids, '{}'))
    and not exists (
      select 1 from ecommerce_accounts ea
      where ea.client_id = v_client_id and ea.platform_id = p.id
    );

  -- Services: replace requested ones (active/stopped ones are managed by staff)
  -- Matches the partial unique index from migration 015 (plain (client_id, service_id)
  -- stopped being a real constraint once ecommerce_account_id-scoped pricing was added).
  delete from client_services where client_id = v_client_id and status = 'requested';
  insert into client_services (client_id, service_id)
  select v_client_id, s.id from services s
  where s.is_active and s.id = any (coalesce(p_service_ids, '{}'))
  on conflict (client_id, service_id) where ecommerce_account_id is null do nothing;
  insert into client_services (client_id, custom_name)
  select v_client_id, trim(c) from unnest(coalesce(p_custom_services, '{}')) c
  where length(trim(c)) > 0;

  return v_client_id;
end $$;


-- ################################################################
-- #### 019_ticket_urgent_flag.sql
-- ################################################################

-- ============================================================
-- 019: Tickets get an urgent flag the CLIENT sets themselves (unlike tasks,
--   where only managers/admins can mark something urgent — a ticket's urgency
--   is the client's own signal about their own request, so it stays theirs
--   to set and to change, same as subject/description/priority already are).
--   Urgent + unassigned tickets become claimable by any staff member, mirroring
--   the existing task urgent pool (claim_task / /urgent).
-- Safe to re-run.
-- ============================================================

alter table tickets add column if not exists is_urgent boolean not null default false;
create index if not exists tickets_urgent_idx on tickets (created_at) where is_urgent and status <> 'done';

-- ─── Visibility: urgent + unassigned tickets are visible to all staff ────
create or replace function public.ticket_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid, p_created_by uuid,
  p_is_urgent boolean, p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'manager' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
      or is_employee(p_assignee_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select ticket_visible(t.client_id, t.department_id, t.assignee_id, t.created_by, t.is_urgent, t.status)
    from tickets t where t.id = p_ticket_id
  ), false)
$$;

drop policy if exists tickets_select on tickets;
create policy tickets_select on tickets for select to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status));

drop policy if exists tickets_update on tickets;
create policy tickets_update on tickets for update to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status))
  with check (true);  -- column-level rules enforced by guard_ticket_write

-- ─── Permissions: client sets/changes is_urgent themselves; staff need to be
--   a manager/admin to mark one urgent, and an unassigned urgent ticket can be
--   claimed by anyone (mirrors guard_task_write's v_is_claim). ────────────
create or replace function public.guard_ticket_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
begin
  if v_uid is null then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    if v_role = 'client' then
      new.client_id     := my_client_id();
      new.status        := 'open';
      new.assignee_id   := null;
      new.assigned_by   := null;
      new.assigned_at   := null;
      new.department_id := null;
      -- new.is_urgent is the client's own call — left as they set it.
    else
      if new.is_urgent and v_role = 'employee' then
        raise exception 'Only managers and admins can mark tickets urgent';
      end if;
      if new.assignee_id is not null then
        if not can_assign(new.assignee_id) then
          raise exception 'You cannot assign tickets to this person';
        end if;
        new.assigned_by := v_uid;
        new.assigned_at := now();
      end if;
    end if;

    if new.ecommerce_account_id is not null and not exists (
      select 1 from ecommerce_accounts ea
      where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
    ) then
      raise exception 'That e-commerce account does not belong to this client';
    end if;

    return new;
  end if;

  -- UPDATE
  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status <> 'done'
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'client' then
    if coalesce(old.created_by <> v_uid, true) or old.status <> 'open' then
      raise exception 'You can only edit your own tickets while they are still open';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new),
         array['subject', 'description', 'details', 'priority', 'is_urgent', 'ecommerce_account_id', 'updated_at']) then
      raise exception 'You can only change the subject, description, details, priority, urgency and e-commerce account';
    end if;

  elsif v_role = 'employee' then
    if not v_is_claim then
      if not (coalesce(old.assignee_id = v_uid, false) or coalesce(old.created_by = v_uid, false)) then
        raise exception 'You can only update tickets assigned to you';
      end if;
      if new.is_urgent is distinct from old.is_urgent then
        raise exception 'Only managers and admins can mark tickets urgent';
      end if;
    end if;

  elsif v_role = 'manager' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id)
               or is_employee(old.assignee_id);
    if not v_in_scope and not v_is_claim then
      raise exception 'This ticket is outside your scope — you can only claim it if it is urgent and unassigned';
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tickets to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  if new.ecommerce_account_id is not null and not exists (
    select 1 from ecommerce_accounts ea
    where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
  ) then
    raise exception 'That e-commerce account does not belong to this client';
  end if;

  return new;
end $$;

-- ─── Claim an urgent, unassigned ticket (first one wins) ─────
create or replace function public.claim_ticket(p_ticket_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  update tickets set assignee_id = auth.uid()
  where id = p_ticket_id and assignee_id is null and is_urgent and status <> 'done';
  if not found then
    raise exception 'This ticket was already claimed or is no longer urgent';
  end if;
end $$;

revoke execute on function public.claim_ticket(uuid) from anon, public;
grant  execute on function public.claim_ticket(uuid) to authenticated;

