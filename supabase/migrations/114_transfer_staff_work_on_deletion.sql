-- Keep assigned work assigned when deleting a staff profile by moving it to
-- the deleted staff member's Reporting To person.
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
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'Only an active Super Admin can transfer work for staff deletion';
  end if;

  select reporting_to
    into v_reporting_to
    from public.profiles
   where id = p_profile_id
     and role in ('manager', 'team_lead', 'employee');

  if not found then
    raise exception 'Staff account not found or cannot be deleted';
  end if;

  if exists (
    select 1 from public.tasks where assignee_id = p_profile_id
    union all
    select 1 from public.tickets where assignee_id = p_profile_id
  ) and (
    v_reporting_to is null
    or not exists (
      select 1
      from public.profiles
      where id = v_reporting_to
        and status = 'active'
        and role in ('super_admin', 'manager', 'team_lead', 'employee')
    )
  ) then
    raise exception 'Cannot delete staff with assigned work without an active Reporting To';
  end if;

  if v_reporting_to is not null then
    perform set_config('app.bypass_guard', 'on', true);
    update public.tasks
       set assignee_id = v_reporting_to
     where assignee_id = p_profile_id;
    update public.tickets
       set assignee_id = v_reporting_to
     where assignee_id = p_profile_id;
  end if;
end;
$$;

revoke all on function public.transfer_staff_work_to_reporting_poc(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_staff_work_to_reporting_poc(uuid, uuid) to service_role;

create or replace function public.staff_deletion_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.time_logs'::regclass
      and conname = 'time_logs_profile_id_fkey'
      and contype = 'f'
      and confdeltype = 'n'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_logs'
      and column_name = 'profile_id'
      and is_nullable = 'YES'
  )
  and to_regprocedure('public.transfer_staff_work_to_reporting_poc(uuid,uuid)') is not null
$$;

revoke all on function public.staff_deletion_ready() from public, anon, authenticated;
grant execute on function public.staff_deletion_ready() to service_role;
