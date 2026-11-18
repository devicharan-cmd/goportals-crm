-- Notify affected staff and their new reporting POC when a Super Admin
-- changes reporting relationships. Former POCs are intentionally not notified.

create or replace function public.change_staff_poc(p_staff_ids uuid[], p_new_poc_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poc_role text;
  v_poc_name text;
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

  -- Keep bulk hierarchy updates serialized with profile/invite reporting-edge edits.
  perform pg_advisory_xact_lock(hashtext('public.change_staff_poc'));

  select role::text, coalesce(nullif(full_name, ''), email)
  into v_poc_role, v_poc_name
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
    select 1
    from public.profiles staff
    where staff.id = any(p_staff_ids)
      and case staff.role::text
        when 'manager' then 'super_admin'
        when 'team_lead' then 'manager'
        when 'employee' then 'team_lead'
        else null
      end is distinct from v_poc_role
  ) then
    raise exception 'The selected POC role is not valid for every selected staff member';
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

  -- These inserts share the transaction with the update, so they roll back
  -- together if any profile update or trigger validation fails.
  insert into public.notifications (recipient_id, type, title, body)
  select staff.id,
         'reporting_poc_changed',
         'Reporting POC updated',
         format('Your reporting POC changed from %s to %s.',
           coalesce(nullif(previous_poc.full_name, ''), previous_poc.email, 'No POC assigned'),
           v_poc_name)
  from public.profiles staff
  left join public.profiles previous_poc on previous_poc.id = staff.reporting_to
  where staff.id = any(p_staff_ids)
    and staff.reporting_to is distinct from p_new_poc_id;

  insert into public.notifications (recipient_id, type, title, body)
  select p_new_poc_id,
         'reporting_poc_assigned',
         'New reporting staff',
         format('%s %s now report to you: %s.',
           count(*),
           case when count(*) = 1 then 'staff member' else 'staff members' end,
           string_agg(coalesce(nullif(staff.full_name, ''), staff.email), ', ' order by staff.full_name, staff.email))
  from public.profiles staff
  where staff.id = any(p_staff_ids)
    and staff.reporting_to is distinct from p_new_poc_id
  having count(*) > 0;

  update public.profiles
  set reporting_to = p_new_poc_id
  where id = any(p_staff_ids)
    and reporting_to is distinct from p_new_poc_id;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.change_staff_poc(uuid[], uuid) from public, anon;
grant execute on function public.change_staff_poc(uuid[], uuid) to authenticated;
