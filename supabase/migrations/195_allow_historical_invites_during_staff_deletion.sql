-- Removing an Auth user deletes their profile. Foreign keys then clear
-- invited_by and reporting_to on invitations that must remain as history.
-- Revalidating an unchanged reporting_to during the invited_by cascade can
-- reject deletion because the former POC profile is already gone.
-- Keep validation on new invitations and changes to reporting details.
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
  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.reporting_to is not distinct from old.reporting_to
     and new.email is not distinct from old.email then
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
