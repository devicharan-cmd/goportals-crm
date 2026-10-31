-- Require an assignee when a task is created, including direct API inserts.
-- This is enforced in the existing database write path without adding table columns.

create or replace function public.require_task_assignee_on_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.assignee_id is null then
    raise exception using
      errcode = '23514',
      message = 'Please select an assignee before creating the task.';
  end if;
  return new;
end $$;

drop trigger if exists tasks_z_require_assignee on public.tasks;
create trigger tasks_z_require_assignee
before insert on public.tasks
for each row execute function public.require_task_assignee_on_insert();
