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
