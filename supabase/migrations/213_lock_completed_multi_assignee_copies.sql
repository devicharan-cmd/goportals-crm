-- Keep completed predecessor copies immutable until the next assignee requests
-- changes. The final copy remains editable under the existing status rules.

begin;

create or replace function public.guard_completed_multi_assignee_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.bypass_guard', true) = 'on'
     or old.task_group_id is null
     or old.status is distinct from 'completed'
     or new.status is not distinct from old.status then
    return new;
  end if;

  if exists (
    select 1
    from public.tasks later
    where later.task_group_id = old.task_group_id
      and later.assignee_sequence > old.assignee_sequence
  ) then
    raise exception 'This completed copy is locked until the next assignee requests changes';
  end if;

  return new;
end
$$;

drop trigger if exists tasks_2_lock_completed_multi_assignee on public.tasks;
create trigger tasks_2_lock_completed_multi_assignee
  before update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.guard_completed_multi_assignee_status();

notify pgrst, 'reload schema';

commit;
