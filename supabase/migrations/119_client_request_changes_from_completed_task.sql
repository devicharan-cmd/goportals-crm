-- Let the client request more work on a completed ticket task. Reopen its
-- parent ticket before changing the task so closed-ticket guards are honored.
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
  if v_status not in ('client_review', 'completed') then
    raise exception 'Changes can only be requested while a task is in Client review or completed';
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

revoke execute on function public.client_request_task_changes(uuid, text) from anon, public;
grant execute on function public.client_request_task_changes(uuid, text) to authenticated;
