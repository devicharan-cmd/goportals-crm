-- ============================================================
-- 042: Migrate every existing 'manager' profile to 'admin', then update
--   the core role-checking functions for the new 5-role model:
--   super_admin / admin / team_lead / employee / client.
--
--   admin  = what 'manager' used to be, but GLOBAL (company-wide) instead
--            of department-scoped, for every table manager used to touch.
--   team_lead = NEW. Picks up the department-scoped half of what 'manager'
--            used to do (via the same two helper functions, manages_department
--            and manager_covers_client, just re-pointed at team_lead), minus
--            manager's old company-wide "see any employee's work" clause
--            (is_employee(...)) — that clause is dropped entirely; admin
--            doesn't need it (already global) and team_lead shouldn't have
--            it (department-scoped by design).
--
--   Run this after 041 has committed.
-- Safe to re-run.
-- ============================================================

update profiles set role = 'admin' where role = 'manager';

-- ─── is_staff(): admin + team_lead replace manager ───────────
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('super_admin', 'admin', 'team_lead', 'employee'), false)
$$;

-- ─── Department scoping: now team_lead's, not manager's ─────
create or replace function public.manages_department(p_department_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'team_lead', false)
     and exists (select 1 from department_members
                 where profile_id = auth.uid() and department_id = p_department_id)
$$;

create or replace function public.manager_covers_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'team_lead', false)
     and exists (select 1 from client_team ct
                 where ct.client_id = p_client_id
                   and (ct.profile_id = auth.uid()
                        or ct.department_id in (select my_department_ids())))
$$;

-- ─── Client visibility: admin global, team_lead via department coverage ─
create or replace function public.can_see_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin'       then true
    when 'team_lead'   then manager_covers_client(p_client_id)
    when 'employee'    then
         exists (select 1 from client_team ct where ct.client_id = p_client_id and ct.profile_id = auth.uid())
      or exists (select 1 from tasks t
                 where t.client_id = p_client_id
                   and (t.assignee_id = auth.uid()
                        or t.created_by = auth.uid()
                        or (t.is_urgent and t.status <> 'done')))
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

-- ─── Assignment: admin can assign anyone (like super_admin); team_lead
--   only active employees sharing a department with them ─────
create or replace function public.can_assign(p_assignee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_assignee is null then true
    when not exists (select 1 from profiles
                     where id = p_assignee and status = 'active'
                       and role in ('super_admin', 'admin', 'team_lead', 'employee')) then false
    when auth.uid() is null then true
    when auth_role() = 'super_admin' then true
    when auth_role() = 'admin' then true
    when p_assignee = auth.uid() then true
    when auth_role() = 'team_lead' then exists (
      select 1 from profiles p
      where p.id = p_assignee and p.role = 'employee' and p.status = 'active'
        and exists (
          select 1 from department_members dm_a
          join department_members dm_b on dm_b.department_id = dm_a.department_id
          where dm_a.profile_id = p_assignee and dm_b.profile_id = auth.uid()
        ))
    else false
  end
$$;

-- ─── Task / ticket visibility: admin global, team_lead department-scoped
--   (manager's old company-wide is_employee(assignee) clause is dropped) ─
create or replace function public.task_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid,
  p_created_by uuid, p_is_urgent boolean, p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'team_lead' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
    else false  -- 'client': no direct task access — see tickets
  end, false)
$$;

create or replace function public.ticket_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid, p_created_by uuid,
  p_is_urgent boolean, p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'team_lead' then
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

-- ─── Write guards: admin falls through unrestricted (like super_admin —
--   neither matches 'client'/'employee'/'team_lead' below); team_lead gets
--   manager's old in-scope check minus is_employee(assignee) ─────
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
      if new.assignee_id is distinct from old.assignee_id then
        raise exception 'Only managers and admins can change the assignee';
      end if;
      if new.due_date is distinct from old.due_date then
        raise exception 'Only managers and admins can change the due date';
      end if;
    end if;

  elsif v_role = 'team_lead' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id);
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

  elsif v_role = 'team_lead' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id);
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

-- ─── approve_client(): admin gets this too ("manage operational approvals") ─
create or replace function public.approve_client(p_client_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_status account_status := case when p_approve then 'active' else 'rejected' end;
begin
  if not (is_super_admin() or auth_role() = 'admin') then
    raise exception 'Only super admins and admins can approve clients';
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

-- ─── guard_client_update(): admin bypasses the restricted-column check too
--   ("manage client relationships" is global, not just department-covered) ─
create or replace function public.guard_client_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin()
     or auth_role() = 'admin' then
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
    raise exception 'Only a super admin or admin can change account status, owner or approval';
  end if;
  return new;
end $$;

-- Note: guard_profile_update() is intentionally NOT changed here — role/status/email/
-- capacity changes on profiles stay super_admin-only. Admin manages department
-- membership (via the department_members RLS policy updated in 043) and invites
-- team_lead/employee, but cannot change anyone's role or status.
