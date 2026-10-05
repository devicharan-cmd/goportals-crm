-- ============================================================
-- GoPortals CRM — schema v2 (2/4): helper functions, triggers, RPCs
-- Business rules live here so every path (UI, API, Kanban drag) obeys them.
-- auth.uid() is NULL for the service role / SQL editor → guards let those through.
-- ============================================================

-- ─── Generic ─────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_set_updated_at        before update on profiles        for each row execute function set_updated_at();
create trigger clients_set_updated_at         before update on clients         for each row execute function set_updated_at();
create trigger client_internal_set_updated_at before update on client_internal for each row execute function set_updated_at();
create trigger task_comments_set_updated_at   before update on task_comments   for each row execute function set_updated_at();

-- True if the two rows differ only in the allowed columns.
create or replace function public.only_changed(p_old jsonb, p_new jsonb, p_allowed text[]) returns boolean
language sql immutable as $$
  select (p_old - p_allowed) = (p_new - p_allowed)
$$;

create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ─── Identity helpers (used by RLS) ──────────────────────────
-- Role of the caller, or NULL if not logged in / not active.
create or replace function public.auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'super_admin', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('super_admin', 'manager', 'employee'), false)
$$;

-- The client company owned by the caller (any status — used during onboarding too).
create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from clients where owner_id = auth.uid()
$$;

create or replace function public.my_department_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select department_id from department_members where profile_id = auth.uid()
$$;

create or replace function public.manages_department(p_department_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'manager', false)
     and exists (select 1 from department_members
                 where profile_id = auth.uid() and department_id = p_department_id)
$$;

-- Manager is on the client's team, or someone from the manager's departments is.
create or replace function public.manager_covers_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'manager', false)
     and exists (select 1 from client_team ct
                 where ct.client_id = p_client_id
                   and (ct.profile_id = auth.uid()
                        or ct.department_id in (select my_department_ids())))
$$;

-- Task visibility rules (see plan: RLS summary).
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
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select task_visible(t.client_id, t.department_id, t.assignee_id, t.created_by, t.is_urgent, t.status)
    from tasks t where t.id = p_task_id
  ), false)
$$;

-- Can the caller assign a task to p_assignee?
--   super_admin → any active staff · manager → self or staff in their departments · employee → self only
create or replace function public.can_assign(p_assignee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_assignee is null then true
    when not exists (select 1 from profiles
                     where id = p_assignee and status = 'active'
                       and role in ('super_admin', 'manager', 'employee')) then false
    when auth.uid() is null then true
    when auth_role() = 'super_admin' then true
    when p_assignee = auth.uid() then true
    when auth_role() = 'manager' then exists (
      select 1 from department_members dm
      where dm.profile_id = p_assignee and dm.department_id in (select my_department_ids()))
    else false
  end
$$;

-- Client must (re)accept when a new agreement version is published.
create or replace function public.needs_agreement() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'client')
     and exists (select 1 from agreements where is_current)
     and not exists (select 1 from agreement_acceptances aa
                     join agreements a on a.id = aa.agreement_id and a.is_current
                     where aa.profile_id = auth.uid())
$$;

-- ─── New login → profile ─────────────────────────────────────
-- Role comes from a matching unused invite (created by super_admin), NEVER from user_metadata.
-- No invite → self-signup client, pending.
-- ⚠ Keep "Confirm email" ON in Supabase Auth so nobody can claim an invited email.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
begin
  select * into inv from invites
  where lower(email) = lower(new.email) and used_at is null and expires_at > now()
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Profile guard ───────────────────────────────────────────
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin() then
    return new;
  end if;

  if not only_changed(to_jsonb(old), to_jsonb(new),
                      array['full_name', 'phone', 'avatar_url', 'updated_at']) then
    raise exception 'Only a super admin can change role, status, email or capacity';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_update();

-- ─── Client guards ───────────────────────────────────────────
create or replace function public.guard_client_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin() then
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

create trigger clients_guard before update on clients
  for each row execute function guard_client_update();

create or replace function public.create_client_internal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into client_internal (client_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger clients_create_internal after insert on clients
  for each row execute function create_client_internal();

-- ─── Task guard (permissions per role) ───────────────────────
-- Triggers fire alphabetically: tasks_a_guard → tasks_b_closed_at → tasks_c_updated_at
create or replace function public.guard_task_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
begin
  -- Service role / SQL editor: no restrictions.
  if v_uid is null then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  -- ── INSERT ──
  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    if v_role = 'client' then
      new.client_id       := my_client_id();
      new.source          := 'client';
      new.status          := 'open';
      new.is_urgent       := false;
      new.assignee_id     := null;
      new.assigned_by     := null;
      new.assigned_at     := null;
      new.estimated_hours := 3;
      new.actual_hours    := null;
      new.parent_task_id  := null;
      if new.type = 'task' then new.type := 'request'; end if;
      new.department_id   := (select department_id from services where id = new.service_id);
      return new;
    end if;

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

  -- ── UPDATE ──
  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status <> 'done'
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'client' then
    if coalesce(old.created_by <> v_uid, true) or old.status <> 'open' then
      raise exception 'You can only edit your own tasks while they are still open';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new),
         array['title', 'description', 'platform_id', 'service_id', 'due_date', 'department_id', 'updated_at']) then
      raise exception 'You can only change the title, description, platform, service and due date';
    end if;
    new.department_id := (select department_id from services where id = new.service_id);
    return new;

  elsif v_role = 'employee' then
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
               or manager_covers_client(old.client_id);
    if not v_in_scope and not v_is_claim then
      raise exception 'This task is outside your departments — you can only claim it if it is urgent and unassigned';
    end if;
  end if;

  -- Assignment change (all staff roles)
  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tasks to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  return new;
end $$;

create trigger tasks_a_guard before insert or update on tasks
  for each row execute function guard_task_write();

create or replace function public.set_closed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.closed_at := now();
  elsif new.status <> 'done' then
    new.closed_at := null;
  end if;
  return new;
end $$;

create trigger tasks_b_closed_at  before insert or update on tasks for each row execute function set_closed_at();
create trigger tasks_c_updated_at before update on tasks           for each row execute function set_updated_at();

-- ─── Task activity log (every change, every UI path) ─────────
create or replace function public.log_task_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into task_activity (task_id, actor_id, action, new_value, is_client_visible)
    values (new.id, v_uid, 'created', new.title, true);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into task_activity (task_id, actor_id, action, old_value, new_value, is_client_visible)
    values (new.id, v_uid, 'status_changed', old.status::text, new.status::text, true);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into task_activity (task_id, actor_id, action, old_value, new_value, is_client_visible)
    values (new.id, v_uid, 'assignee_changed', old.assignee_id::text, new.assignee_id::text, true);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into task_activity (task_id, actor_id, action, old_value, new_value, is_client_visible)
    values (new.id, v_uid, 'due_date_changed', old.due_date::text, new.due_date::text, true);
  end if;
  if new.title is distinct from old.title or new.description is distinct from old.description then
    insert into task_activity (task_id, actor_id, action, is_client_visible)
    values (new.id, v_uid, 'edited', true);
  end if;
  if new.priority is distinct from old.priority then
    insert into task_activity (task_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'priority_changed', old.priority::text, new.priority::text);
  end if;
  if new.is_urgent is distinct from old.is_urgent then
    insert into task_activity (task_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'urgent_changed', old.is_urgent::text, new.is_urgent::text);
  end if;
  return null;
end $$;

create trigger tasks_log_activity after insert or update on tasks
  for each row execute function log_task_activity();

-- ─── Notifications ───────────────────────────────────────────
create or replace function public.notify_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- New client task → super admins + managers of its department
  if tg_op = 'INSERT' and new.source = 'client' then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    select p.id, 'client_task',
           'New request from ' || (select company_name from clients where id = new.client_id),
           new.title, new.id, new.client_id
    from profiles p
    where p.status = 'active'
      and (p.role = 'super_admin'
           or (p.role = 'manager' and new.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = new.department_id)));
  end if;

  -- Assigned to someone else
  if new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.assignee_id, 'assigned', 'Task assigned to you', new.title, new.id, new.client_id);
  end if;

  -- Status changed → tell the creator (incl. the client)
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.created_by, 'status_changed',
            'Task moved to ' || replace(new.status::text, '_', ' '), new.title, new.id, new.client_id);
  end if;

  return null;
end $$;

create trigger tasks_notify after insert or update on tasks
  for each row execute function notify_task_change();

-- ─── Comment guard ───────────────────────────────────────────
create or replace function public.guard_comment_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
  end if;
  if exists (select 1 from profiles where id = auth.uid() and role = 'client') then
    new.is_internal := false;
  end if;
  return new;
end $$;

create trigger task_comments_guard before insert or update on task_comments
  for each row execute function guard_comment_write();

-- ─── RPCs ────────────────────────────────────────────────────

-- Employee/manager self-assigns an urgent, unassigned task. Atomic: only one person wins.
-- Security invoker → RLS + guard_task_write apply.
create or replace function public.claim_task(p_task_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  update tasks set assignee_id = auth.uid()
  where id = p_task_id and assignee_id is null and is_urgent and status <> 'done';
  if not found then
    raise exception 'This task was already claimed or is no longer urgent';
  end if;
end $$;

-- Client onboarding wizard: company details + platforms + services (+ "other" free text).
-- Creates the client row on first call; later calls update it while not yet active.
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

  -- Platforms: replace selection
  delete from client_platforms
  where client_id = v_client_id and not (platform_id = any (coalesce(p_platform_ids, '{}')));
  insert into client_platforms (client_id, platform_id)
  select v_client_id, p.id from platforms p
  where p.is_active and p.id = any (coalesce(p_platform_ids, '{}'))
  on conflict do nothing;

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

-- Client accepts the current agreement. Invited / admin-created clients become active;
-- self-signups stay pending until a super admin approves.
create or replace function public.accept_agreement(
  p_agreement_id uuid, p_ip text default null, p_user_agent text default null
) returns account_status
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
begin
  select * into v_client from clients where owner_id = auth.uid();
  if v_client.id is null then
    raise exception 'Please complete your company details first';
  end if;
  if not exists (select 1 from agreements where id = p_agreement_id and is_current) then
    raise exception 'This agreement version is no longer current — please reload the page';
  end if;

  insert into agreement_acceptances (client_id, profile_id, agreement_id, ip, user_agent)
  values (v_client.id, auth.uid(), p_agreement_id, p_ip, p_user_agent)
  on conflict (profile_id, agreement_id) do nothing;

  if v_client.signup_source <> 'self_signup' and v_client.status = 'pending' then
    perform set_config('app.bypass_guard', 'on', true);
    update clients  set status = 'active' where id = v_client.id;
    update profiles set status = 'active' where id = auth.uid() and status = 'pending';
    return 'active';
  end if;

  return v_client.status;
end $$;

-- Super admin approves or rejects a self-signup client.
create or replace function public.approve_client(p_client_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_status account_status := case when p_approve then 'active' else 'rejected' end;
begin
  if not is_super_admin() then
    raise exception 'Only super admins can approve clients';
  end if;
  select owner_id into v_owner from clients where id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;
  if p_approve and not exists (select 1 from agreement_acceptances where client_id = p_client_id) then
    raise exception 'This client has not accepted the agreement yet';
  end if;

  update clients set status = v_status, approved_by = auth.uid(), approved_at = now()
  where id = p_client_id;
  if v_owner is not null then
    update profiles set status = v_status where id = v_owner;
  end if;
end $$;

-- RPCs are for logged-in users only.
revoke execute on function public.claim_task(uuid)                                   from anon, public;
revoke execute on function public.save_client_onboarding(jsonb, uuid[], uuid[], text[]) from anon, public;
revoke execute on function public.accept_agreement(uuid, text, text)                 from anon, public;
revoke execute on function public.approve_client(uuid, boolean)                      from anon, public;
grant  execute on function public.claim_task(uuid)                                   to authenticated;
grant  execute on function public.save_client_onboarding(jsonb, uuid[], uuid[], text[]) to authenticated;
grant  execute on function public.accept_agreement(uuid, text, text)                 to authenticated;
grant  execute on function public.approve_client(uuid, boolean)                      to authenticated;
