-- A Super Admin keeps that role for the life of the profile, including when
-- another Super Admin edits the profile through a service-role API.
create or replace function public.protect_super_admin_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.role::text = 'super_admin' and new.role is distinct from old.role then
    raise exception 'A Super Admin role cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_super_admin_role on public.profiles;
create trigger profiles_protect_super_admin_role
  before update of role on public.profiles
  for each row execute function public.protect_super_admin_role();

-- Profile deletion must go through the checked API so a Super Admin cannot
-- delete their own profile or bypass the reporting and Auth cleanup checks.
drop policy if exists profiles_delete on public.profiles;

-- Accepted and cancelled invitations are history, not active reporting links.
-- Keep their rows when a former POC is deleted, while pending invitations still
-- require a valid POC and therefore must be cancelled or reissued first.
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
    if tg_op = 'UPDATE' and (new.used_at is not null or new.cancelled_at is not null) then
      return new;
    end if;
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

alter table public.invites drop constraint if exists invites_reporting_to_fkey;
alter table public.invites add constraint invites_reporting_to_fkey
  foreign key (reporting_to) references public.profiles(id) on delete set null;

-- Super Admins have no reporting POC. Hand their assigned work to the active
-- Super Admin performing the deletion; all other staff keep the existing POC
-- transfer behavior. Direct reports remain protected by the reporting FK.
create or replace function public.transfer_staff_work_to_reporting_poc(
  p_profile_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporting_to uuid;
  v_target_role text;
begin
  if p_actor_id = p_profile_id or not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'super_admin' and status = 'active'
  ) then
    raise exception 'Only another active Super Admin can transfer work for staff deletion';
  end if;

  select reporting_to, role::text into v_reporting_to, v_target_role
  from public.profiles
  where id = p_profile_id and role::text in ('super_admin', 'manager', 'team_lead', 'employee')
  for update;

  if not found then
    raise exception 'Staff account not found or cannot be deleted';
  end if;

  if v_target_role = 'super_admin' then
    v_reporting_to := p_actor_id;
  end if;

  if exists (
    select 1 from public.tasks where assignee_id = p_profile_id
    union all
    select 1 from public.tickets where assignee_id = p_profile_id
  ) and (
    v_reporting_to is null
    or not exists (
      select 1 from public.profiles
      where id = v_reporting_to
        and status = 'active'
        and role::text in ('super_admin', 'manager', 'team_lead', 'employee')
    )
  ) then
    raise exception 'Cannot delete staff with assigned work without an active Reporting To';
  end if;

  if v_reporting_to is not null then
    perform set_config('app.bypass_guard', 'on', true);
    update public.tasks set assignee_id = v_reporting_to where assignee_id = p_profile_id;
    update public.tickets set assignee_id = v_reporting_to where assignee_id = p_profile_id;
  end if;
end;
$$;

revoke all on function public.transfer_staff_work_to_reporting_poc(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_staff_work_to_reporting_poc(uuid, uuid) to service_role;

create or replace function public.super_admin_deletion_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.invites'::regclass
      and conname = 'invites_reporting_to_fkey'
      and confdeltype = 'n'
  ) and exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_protect_super_admin_role'
      and not tgisinternal
  )
$$;

revoke all on function public.super_admin_deletion_ready() from public, anon, authenticated;
grant execute on function public.super_admin_deletion_ready() to service_role;
