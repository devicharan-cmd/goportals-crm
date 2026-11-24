-- Staff may assign tasks to any active staff member, regardless of reporting hierarchy.
-- Keep the shared can_assign() function unchanged because ticket assignment also uses it.
create or replace function public.can_assign_task(p_assignee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_assignee is null then true
    when auth.uid() is null then true
    when auth_role() = 'client' then false
    else exists (
      select 1
      from public.profiles
      where id = p_assignee
        and status = 'active'
        and role in ('super_admin', 'manager', 'team_lead', 'employee')
    )
  end
$$;

revoke all on function public.can_assign_task(uuid) from public, anon;
grant execute on function public.can_assign_task(uuid) to authenticated;

-- Point the task write guard at the task-only assignment rule. Visibility remains
-- governed by task_visible()/can_see_task(): the assigner and current assignee can
-- see the task, while all other visibility rules remain unchanged.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.guard_task_write()'::regprocedure) into v_definition;
  if v_definition is null then raise exception 'public.guard_task_write was not found'; end if;
  v_definition := replace(v_definition, 'not can_assign(new.assignee_id)', 'not public.can_assign_task(new.assignee_id)');
  if position('public.can_assign_task(new.assignee_id)' in v_definition) = 0 then
    raise exception 'guard_task_write assignment check was not found';
  end if;
  execute v_definition;
end
$$;
