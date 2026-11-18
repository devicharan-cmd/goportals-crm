-- A client decision returns the task to the internal review workflow. The
-- assignee and assigner are notified separately so either can open the task.
create or replace function public.client_approve_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
  v_visibility text;
  v_ticket_status public.ticket_status;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'Only the client can approve a task';
  end if;

  select task.ticket_id, task.client_id, task.status, task.visibility, ticket.status
    into v_ticket_id, v_client_id, v_status, v_visibility, v_ticket_status
    from public.tasks task
    left join public.tickets ticket on ticket.id = task.ticket_id
   where task.id = p_task_id
   for update of task;

  if not found or v_visibility <> 'public' or v_client_id is distinct from my_client_id()
     or (v_ticket_id is not null and v_ticket_status is null)
     or (v_ticket_id is not null and not can_see_ticket(v_ticket_id)) then
    raise exception 'Task not found';
  end if;
  if v_status <> 'client_review' then
    raise exception 'Only a task in Client review can be approved';
  end if;
  if v_ticket_id is not null and v_ticket_status = 'closed' then
    raise exception 'This ticket is closed';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks set status = 'ready_for_review' where id = p_task_id;
end
$$;

revoke execute on function public.client_approve_task(uuid) from anon, public;
grant execute on function public.client_approve_task(uuid) to authenticated;

create or replace function public.notify_staff_of_client_task_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_title text;
  v_body text;
begin
  if auth_role() is distinct from 'client' then
    return new;
  end if;

  if new.status = 'ready_for_review' and old.status = 'client_review' then
    v_type := 'client_task_approved';
    v_title := format('Client approved GP-%s: %s', new.task_number, new.title);
    v_body := 'The client approved this task. Review the result and complete it when ready.';
  elsif new.status = 'changes_requested' and old.status in ('client_review', 'completed') then
    v_type := 'client_task_changes_requested';
    v_title := format('Client requested changes for GP-%s: %s', new.task_number, new.title);
    v_body := 'The client requested changes. Open the task to review their feedback.';
  else
    return new;
  end if;

  insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
  select recipients.recipient_id, v_type, v_title, v_body, new.id, new.client_id
    from (
      select distinct recipient_id
        from unnest(array[new.assignee_id, new.assigned_by]) as ids(recipient_id)
       where ids.recipient_id is not null
    ) recipients;

  return new;
end
$$;

drop trigger if exists notify_staff_of_client_task_review on public.tasks;
create trigger notify_staff_of_client_task_review
  after update of status on public.tasks
  for each row
  when (new.status is distinct from old.status)
  execute function public.notify_staff_of_client_task_review();
