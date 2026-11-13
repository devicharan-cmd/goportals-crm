-- Client review is optional. Staff may move a task into or out of Client
-- review, or complete it directly. Client actions are available only while
-- the task is in Client review; approval returns it to company review.
create or replace function public.guard_client_review_task_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.bypass_guard', true) = 'on'
     or auth_role() = 'client' then
    return new;
  end if;

  if old.status = 'completed' then
    raise exception 'Completed tasks cannot be moved to another status';
  end if;

  if new.status = 'changes_requested' then
    raise exception 'Only the client can request changes during Client review';
  end if;

  return new;
end
$$;

create or replace function public.client_approve_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'Only the client can approve a task';
  end if;

  select task.ticket_id, task.client_id, task.status
    into v_ticket_id, v_client_id, v_status
    from public.tasks task
   where task.id = p_task_id
   for update;
  if not found or v_ticket_id is null or v_client_id is distinct from my_client_id()
     or not can_see_ticket(v_ticket_id) then
    raise exception 'Task not found';
  end if;
  if v_status <> 'client_review' then
    raise exception 'Only a task in Client review can be approved';
  end if;
  if exists (select 1 from public.tickets where id = v_ticket_id and status = 'closed') then
    raise exception 'This ticket is closed';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks set status = 'ready_for_review' where id = p_task_id;
end
$$;

create or replace function public.client_request_task_changes(p_task_id uuid, p_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
  v_ticket_status public.ticket_status;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'Only the client can request task changes';
  end if;
  if p_feedback is null or length(trim(p_feedback)) = 0 or length(trim(p_feedback)) > 4000 then
    raise exception 'Feedback must be between 1 and 4000 characters';
  end if;

  select task.ticket_id, task.client_id, task.status, ticket.status
    into v_ticket_id, v_client_id, v_status, v_ticket_status
    from public.tasks task
    left join public.tickets ticket on ticket.id = task.ticket_id
   where task.id = p_task_id
   for update of task;

  if not found or v_ticket_id is null or v_client_id is distinct from my_client_id()
     or not can_see_ticket(v_ticket_id) then
    raise exception 'Task not found';
  end if;
  if v_status <> 'client_review' then
    raise exception 'Changes can only be requested while a task is in Client review';
  end if;
  if v_ticket_status is null then
    raise exception 'The task ticket could not be found';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  if v_ticket_status = 'closed' then
    update public.tickets set status = 'assigned' where id = v_ticket_id;
  end if;
  update public.tasks set status = 'changes_requested' where id = p_task_id;
  insert into public.task_comments (task_id, author_id, body, is_internal)
  values (p_task_id, v_uid, trim(p_feedback), false);
end
$$;

revoke execute on function public.client_approve_task(uuid) from anon, public;
grant execute on function public.client_approve_task(uuid) to authenticated;
revoke execute on function public.client_request_task_changes(uuid, text) from anon, public;
grant execute on function public.client_request_task_changes(uuid, text) to authenticated;
