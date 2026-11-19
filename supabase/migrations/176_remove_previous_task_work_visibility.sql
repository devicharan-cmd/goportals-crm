-- Do not keep task visibility merely because someone changed its assignee in
-- the past. Current visibility continues to follow the reporting hierarchy,
-- the current assignee, the person who assigned it, and existing task rules.

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when auth_role() = 'client' then
        t.visibility = 'public'
        and t.client_id = my_client_id()
        and (t.ticket_id is null or can_see_ticket(t.ticket_id))
      when auth_role() in ('manager', 'team_lead')
       and t.assignee_id is not null
       and exists (
         with recursive reports(id) as (
           select p.id
           from public.profiles p
           where p.reporting_to = auth.uid()
           union
           select child.id
           from public.profiles child
           join reports parent on child.reporting_to = parent.id
         )
         select 1 from reports where id = t.assignee_id
       ) then true
      when auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
       and (t.assignee_id = auth.uid() or t.assigned_by = auth.uid()) then true
      else public.task_visible(
        t.client_id, t.department_id, t.assignee_id, t.created_by,
        t.is_urgent, t.status, t.assigned_by
      )
    end
    from public.tasks t
    where t.id = p_task_id
  ), false)
$$;

create or replace function public.can_see_task_row(
  p_task_id uuid,
  p_ticket_id uuid,
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_assigned_by uuid,
  p_is_urgent boolean,
  p_status public.task_status,
  p_visibility text
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case
    when auth_role() = 'client' then
      p_visibility = 'public'
      and p_client_id = my_client_id()
      and (p_ticket_id is null or public.can_see_ticket(p_ticket_id))
    when auth_role() in ('manager', 'team_lead')
     and p_assignee_id is not null
     and exists (
       with recursive reports(id) as (
         select profile.id
         from public.profiles profile
         where profile.reporting_to = auth.uid()
         union
         select child.id
         from public.profiles child
         join reports parent on child.reporting_to = parent.id
       )
       select 1 from reports where id = p_assignee_id
     ) then true
    when auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
     and (p_assignee_id = auth.uid() or p_assigned_by = auth.uid()) then true
    else public.task_visible(
      p_client_id, p_department_id, p_assignee_id, p_created_by,
      p_is_urgent, p_status, p_assigned_by
    )
  end, false)
$$;

revoke all on function public.can_see_task_row(uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean, public.task_status, text)
  from public, anon;
grant execute on function public.can_see_task_row(uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean, public.task_status, text)
  to authenticated;

-- A former assignee who created the recurring schedule must also lose schedule
-- controls after reassignment. Preserve both RPCs and add this check to their
-- existing creator-only guards.
do $$
declare
  v_definition text;
  v_old_guard text := $guard$if auth.uid() is distinct from v_schedule.created_by then$guard$;
  v_new_guard text := $guard$if auth.uid() is distinct from v_schedule.created_by
     or public.is_former_task_assignee(p_task_id) then$guard$;
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.set_task_schedule_enabled(uuid,boolean)'::regprocedure,
    'public.update_task_schedule(uuid,text,integer,date,time,boolean)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    if position(v_old_guard in v_definition) > 0 then
      execute replace(v_definition, v_old_guard, v_new_guard);
    elsif position(v_new_guard in v_definition) = 0 then
      raise exception 'Expected schedule creator guard was not found in %', v_signature;
    end if;
  end loop;
end
$$;
