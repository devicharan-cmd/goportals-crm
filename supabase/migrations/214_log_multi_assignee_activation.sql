-- Record activation of a next assignee even when its copy was already Todo.
-- Without this, the handoff has no status update for the Activity timeline.

begin;

create or replace function public.sync_multi_assignee_task_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
  v_next_assignee uuid;
  v_next_number bigint;
  v_next_title text;
  v_next_client uuid;
  v_next_status public.task_status;
begin
  if new.task_group_id is null or new.status is not distinct from old.status or new.status <> 'completed' then
    return new;
  end if;

  select id, assignee_id, task_number, title, client_id, status
    into v_next, v_next_assignee, v_next_number, v_next_title, v_next_client, v_next_status
  from public.tasks
  where task_group_id = new.task_group_id and assignee_sequence > new.assignee_sequence
  order by assignee_sequence limit 1;

  if v_next is not null then
    if v_next_status is distinct from 'todo' then
      perform set_config('app.bypass_guard', 'on', true);
      update public.tasks set status = 'todo', updated_at = now() where id = v_next;
      perform set_config('app.bypass_guard', 'off', true);
    else
      insert into public.task_activity (task_id, actor_id, action, old_value, new_value, is_client_visible)
      values (v_next, coalesce(auth.uid(), new.assignee_id), 'status_changed', 'waiting', 'todo', false);
    end if;

    if v_next_assignee is not null and v_next_assignee is distinct from auth.uid() then
      insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
      values (v_next_assignee, 'assigned',
        'GP-' || v_next_number || ': Task assigned to you', v_next_title, v_next, v_next_client);
    end if;
  end if;
  return new;
end
$$;

notify pgrst, 'reload schema';

commit;
