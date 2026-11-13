-- Only the task assignee or a Super Admin may change a staff task's status.
-- Client-owned task status updates remain governed by guard_task_write().
create or replace function public.guard_task_status_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.bypass_guard', true) = 'on'
     or auth_role() in ('client', 'super_admin') then
    return new;
  end if;

  if old.assignee_id is distinct from auth.uid() then
    raise exception 'Only the assigned person or a Super Admin can change this task status';
  end if;

  return new;
end
$$;

drop trigger if exists tasks_1_assignee_status_only on public.tasks;
create trigger tasks_1_assignee_status_only
  before update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.guard_task_status_assignee();
