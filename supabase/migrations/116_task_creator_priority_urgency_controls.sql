-- Allow the task creator and Super Admins to change priority and urgency from
-- the task properties panel, while leaving all other task fields guarded.
create or replace function public.update_task_priority_urgency(
  p_task_id uuid,
  p_priority public.task_priority default null,
  p_is_urgent boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := auth_role();
  v_created_by uuid;
begin
  if v_uid is null or v_role is null or v_role not in ('super_admin', 'manager', 'team_lead', 'employee') then
    raise exception 'An active staff account is required';
  end if;

  if p_priority is null and p_is_urgent is null then
    raise exception 'Choose a priority or urgent value to update';
  end if;

  select created_by
    into v_created_by
    from public.tasks
   where id = p_task_id
   for update;
  if not found then
    raise exception 'Task not found';
  end if;

  if v_role <> 'super_admin' and v_created_by is distinct from v_uid then
    raise exception 'Only the task creator or a Super Admin can change priority and urgency';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks
     set priority = coalesce(p_priority, priority),
         is_urgent = coalesce(p_is_urgent, is_urgent)
   where id = p_task_id;
end;
$$;

revoke all on function public.update_task_priority_urgency(uuid, public.task_priority, boolean) from public, anon;
grant execute on function public.update_task_priority_urgency(uuid, public.task_priority, boolean) to authenticated;
