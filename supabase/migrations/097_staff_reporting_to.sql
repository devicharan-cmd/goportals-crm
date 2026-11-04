-- Store each staff member's direct POC. The hierarchy is derived by following
-- this single parent link; no transitive hierarchy rows are duplicated.
alter table public.profiles
  add column if not exists reporting_to uuid references public.profiles(id) on delete restrict;

alter table public.invites
  add column if not exists reporting_to uuid references public.profiles(id) on delete restrict;

create or replace function public.validate_profile_reporting_to()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_role app_role;
  v_parent_status account_status;
  v_expected_role app_role;
begin
  if tg_op = 'UPDATE'
     and (new.role is distinct from old.role or new.status is distinct from old.status)
     and (
       exists (
         select 1
         from public.profiles child
         where child.reporting_to = new.id
           and (
             new.status <> 'active'
             or child.role is distinct from case new.role
               when 'super_admin' then 'admin'::app_role
               when 'admin' then 'team_lead'::app_role
               when 'team_lead' then 'employee'::app_role
             end
           )
       )
       or exists (
         select 1
         from public.invites pending
         where pending.reporting_to = new.id
           and pending.used_at is null
           and pending.cancelled_at is null
           and (
             new.status <> 'active'
             or (case pending.role
               when 'admin' then 'super_admin'::app_role
               when 'team_lead' then 'admin'::app_role
               when 'employee' then 'team_lead'::app_role
             end) is distinct from new.role
           )
       )
     ) then
    raise exception 'Reassign direct reports and pending invitations before changing this person''s role or suspending their account';
  end if;

  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.reporting_to is not distinct from old.reporting_to then
    return new;
  end if;

  if new.role in ('super_admin', 'client') then
    if new.reporting_to is not null then
      raise exception 'Super admins and clients cannot have a reporting POC';
    end if;
    return new;
  end if;

  v_expected_role := case new.role
    when 'admin' then 'super_admin'::app_role
    when 'team_lead' then 'admin'::app_role
    when 'employee' then 'team_lead'::app_role
  end;

  if new.reporting_to is null then
    return new;
  end if;
  if new.id is not null and new.reporting_to = new.id then
    raise exception 'A person cannot report to themselves';
  end if;

  select role, status into v_parent_role, v_parent_status
  from public.profiles
  where id = new.reporting_to;

  if not found or v_parent_role is distinct from v_expected_role or v_parent_status <> 'active' then
    raise exception 'The reporting POC must be an active %', v_expected_role;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_reporting_to_guard on public.profiles;
create trigger profiles_reporting_to_guard
  before insert or update on public.profiles
  for each row execute function public.validate_profile_reporting_to();

create or replace function public.validate_invite_reporting_to()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_role app_role;
  v_parent_status account_status;
  v_parent_email text;
  v_expected_role app_role;
begin
  if new.role in ('super_admin', 'client') then
    if new.reporting_to is not null then
      raise exception 'Super admins and clients cannot have a reporting POC';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.reporting_to is null and new.reporting_to is null then
    return new;
  end if;

  v_expected_role := case new.role
    when 'admin' then 'super_admin'::app_role
    when 'team_lead' then 'admin'::app_role
    when 'employee' then 'team_lead'::app_role
  end;

  if new.reporting_to is null then
    raise exception 'A reporting POC is required for this staff invitation';
  end if;

  select role, status, email into v_parent_role, v_parent_status, v_parent_email
  from public.profiles
  where id = new.reporting_to;

  if not found or v_parent_role is distinct from v_expected_role or v_parent_status <> 'active' then
    raise exception 'The reporting POC must be an active %', v_expected_role;
  end if;
  if lower(new.email) = lower(v_parent_email) then
    raise exception 'A person cannot report to themselves';
  end if;

  return new;
end;
$$;

drop trigger if exists invites_reporting_to_guard on public.invites;
create trigger invites_reporting_to_guard
  before insert or update on public.invites
  for each row execute function public.validate_invite_reporting_to();

-- Preserve the existing invite acceptance behavior and copy the selected POC
-- onto the profile when the invitee's Auth user is created.
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
    insert into profiles (id, email, full_name, role, status, signup_source, job_title, reporting_to)
    values (
      new.id, new.email,
      coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', ''),
      inv.role,
      case when inv.role = 'client' then 'pending' else 'active' end::account_status,
      case when inv.role = 'client'
           then (case when inv.client_id is null then 'invite' else 'admin_created' end)::signup_source
      end,
      inv.job_title,
      inv.reporting_to
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
