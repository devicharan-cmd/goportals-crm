-- Allow every non-client staff member to report to any active staff member.
-- The reporting_to link defines hierarchy; role-based permissions stay intact.

create or replace function public.validate_profile_reporting_to()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_role text;
  v_parent_status account_status;
begin
  if tg_op = 'INSERT'
     or new.role is distinct from old.role
     or new.reporting_to is distinct from old.reporting_to
     or new.status is distinct from old.status then
    perform pg_advisory_xact_lock(hashtext('public.change_staff_poc'));
  end if;

  if tg_op = 'UPDATE'
     and (new.role is distinct from old.role or new.status is distinct from old.status)
     and (
       exists (
         select 1
         from public.profiles child
         where child.reporting_to = new.id
           and (new.status <> 'active' or new.role::text = 'client')
       )
       or exists (
         select 1
         from public.invites pending
         where pending.reporting_to = new.id
           and pending.used_at is null
           and pending.cancelled_at is null
           and (new.status <> 'active' or new.role::text = 'client')
       )
     ) then
    raise exception 'Reassign direct reports in Change POC and cancel/reissue incompatible pending invitations before changing this person''s role or suspending their account';
  end if;

  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.reporting_to is not distinct from old.reporting_to
     and new.status is not distinct from old.status then
    return new;
  end if;

  if new.role::text in ('super_admin', 'client') then
    if new.reporting_to is not null then
      raise exception 'Super admins and clients cannot have a reporting POC';
    end if;
    return new;
  end if;

  if new.role::text not in ('manager', 'team_lead', 'employee') then
    raise exception 'This staff role cannot have a reporting POC';
  end if;
  if new.reporting_to is null then
    raise exception 'Select an active Reporting To person';
  end if;
  if new.id is not null and new.reporting_to = new.id then
    raise exception 'A person cannot report to themselves';
  end if;

  select role::text, status into v_parent_role, v_parent_status
  from public.profiles
  where id = new.reporting_to;

  if not found or v_parent_status <> 'active' or v_parent_role = 'client' then
    raise exception 'The reporting POC must be an active staff member';
  end if;

  if new.id is not null and exists (
    with recursive ancestors(id, reporting_to) as (
      select p.id, p.reporting_to from public.profiles p where p.id = new.reporting_to
      union
      select parent.id, parent.reporting_to
      from public.profiles parent
      join ancestors child on child.reporting_to = parent.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'This reporting POC would create a reporting cycle';
  end if;

  return new;
end;
$$;

create or replace function public.validate_invite_reporting_to()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_role text;
  v_parent_status account_status;
  v_parent_email text;
begin
  if new.role::text in ('super_admin', 'client') then
    if new.reporting_to is not null then
      raise exception 'Super admins and clients cannot have a reporting POC';
    end if;
    return new;
  end if;

  if new.role::text not in ('manager', 'team_lead', 'employee') then
    raise exception 'This staff role cannot have a reporting POC';
  end if;

  if new.reporting_to is null then
    raise exception 'A reporting POC is required for this staff invitation';
  end if;

  select role::text, status, email into v_parent_role, v_parent_status, v_parent_email
  from public.profiles
  where id = new.reporting_to;

  if not found or v_parent_status <> 'active' or v_parent_role = 'client' then
    raise exception 'The reporting POC must be an active staff member';
  end if;
  if lower(new.email) = lower(v_parent_email) then
    raise exception 'A person cannot report to themselves';
  end if;

  return new;
end;
$$;

create or replace function public.change_staff_poc(p_staff_ids uuid[], p_new_poc_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
  v_staff_count integer;
begin
  if auth.uid() is null or auth_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can change staff reporting POCs';
  end if;
  if p_staff_ids is null or cardinality(p_staff_ids) = 0 then
    raise exception 'Select at least one staff member';
  end if;
  if p_new_poc_id is null then
    raise exception 'Select a new reporting POC';
  end if;
  if cardinality(p_staff_ids) <> (select count(distinct id) from unnest(p_staff_ids) as selected(id)) then
    raise exception 'The selected staff list contains duplicates';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.change_staff_poc'));

  perform 1
  from public.profiles
  where id = p_new_poc_id and status = 'active' and role::text <> 'client'
  for update;
  if not found then
    raise exception 'The new POC must be an active staff member';
  end if;

  perform 1
  from public.profiles
  where id = any(p_staff_ids)
  order by id
  for update;
  get diagnostics v_staff_count = row_count;
  if v_staff_count <> cardinality(p_staff_ids) then
    raise exception 'One or more selected staff members no longer exist';
  end if;
  if p_new_poc_id = any(p_staff_ids) then
    raise exception 'A staff member cannot be their own reporting POC';
  end if;
  if exists (
    select 1 from public.profiles
    where id = any(p_staff_ids) and role::text in ('super_admin', 'client')
  ) then
    raise exception 'Super Admins and clients cannot have a reporting POC';
  end if;

  if exists (
    with recursive ancestors(id, reporting_to) as (
      select p.id, p.reporting_to from public.profiles p where p.id = p_new_poc_id
      union
      select parent.id, parent.reporting_to
      from public.profiles parent
      join ancestors child on child.reporting_to = parent.id
    )
    select 1 from ancestors where id = any(p_staff_ids)
  ) then
    raise exception 'This POC change would create a reporting cycle';
  end if;

  update public.profiles
  set reporting_to = p_new_poc_id
  where id = any(p_staff_ids);
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.change_staff_poc(uuid[], uuid) from public, anon;
grant execute on function public.change_staff_poc(uuid[], uuid) to authenticated;
