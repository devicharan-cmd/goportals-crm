-- Require internal In review before completion and reserve Client review for
-- public tasks linked to a ticket. Standalone and private tasks stay internal.
-- The client's trusted review RPC retains its bypass.
create or replace function public.guard_task_completion_after_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

  if new.status = 'client_review'
     and new.status is distinct from old.status
     and (new.ticket_id is null or new.visibility is distinct from 'public') then
    raise exception 'Client review is only for public tasks linked to a ticket';
  end if;

  if new.status = 'completed'
     and new.status is distinct from old.status
     and old.status is distinct from 'ready_for_review' then
    raise exception 'Move the task to In review before completing it';
  end if;

  return new;
end
$$;

drop trigger if exists task_completion_requires_review on public.tasks;
create trigger task_completion_requires_review
  before update of status on public.tasks
  for each row execute function public.guard_task_completion_after_review();
