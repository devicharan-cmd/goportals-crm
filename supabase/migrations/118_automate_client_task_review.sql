-- Staff must explicitly submit work to Client review. Only the client's
-- approval or request-changes actions may resolve that review.
create or replace function public.guard_client_review_task_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.bypass_guard', true) = 'on'
     or auth_role() = 'client' then
    return new;
  end if;

  if old.status = 'client_review' then
    raise exception 'Only the client can approve this task or request changes';
  end if;

  if old.status = 'completed' then
    raise exception 'Completed tasks cannot be moved to another status';
  end if;

  if new.status = 'changes_requested' then
    raise exception 'Only the client can request changes during Client review';
  end if;

  if new.status = 'completed' then
    raise exception 'Move the task to Client review; only the client can approve it as completed';
  end if;

  return new;
end
$$;

drop trigger if exists tasks_guard_client_review_status on public.tasks;
drop trigger if exists tasks_0_client_review_status on public.tasks;
create trigger tasks_0_client_review_status
  before update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.guard_client_review_task_status();

-- Ticket status is constrained to unassigned, assigned, or closed in the
-- production schema. Keep task-driven synchronization within those values.
create or replace function public.sync_ticket_progress_from_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_ticket_status public.ticket_status;
  v_total integer;
  v_done integer;
  v_unassigned integer;
  v_target public.ticket_status;
begin
  v_ticket_id := case when tg_op = 'DELETE' then old.ticket_id else new.ticket_id end;
  if v_ticket_id is null then return null; end if;

  select status into v_ticket_status from public.tickets where id = v_ticket_id;
  if not found or v_ticket_status = 'closed' then return null; end if;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status <> 'cancelled' and assignee_id is null)
    into v_total, v_done, v_unassigned
    from public.tasks
   where ticket_id = v_ticket_id;

  if v_total = 0 then return null;
  elsif v_done = v_total then v_target := 'closed';
  elsif v_unassigned = 0 then v_target := 'assigned';
  else v_target := 'unassigned';
  end if;

  if v_target <> v_ticket_status then
    perform set_config('app.bypass_guard', 'on', true);
    update public.tickets set status = v_target where id = v_ticket_id;
  end if;
  return null;
end
$$;

-- Repair tasks that staff marked completed before the client approval flow was
-- enforced. Reopen their closed tickets into client review as well.
do $$
declare
  v_prior_bypass text := current_setting('app.bypass_guard', true);
  v_prior_suppress_activity text := current_setting('app.suppress_activity', true);
begin
  perform set_config('app.bypass_guard', 'on', true);
  perform set_config('app.suppress_activity', 'on', true);

  with last_status_change as (
    select distinct on (a.task_id)
      a.task_id, a.actor_id, a.new_value
    from public.task_activity a
    where a.action = 'status_changed'
    order by a.task_id, a.created_at desc, a.id desc
  ), affected_tasks as (
    select task.ticket_id
    from public.tasks task
    join last_status_change activity on activity.task_id = task.id
    join public.profiles actor on actor.id = activity.actor_id
    where task.ticket_id is not null
      and task.status = 'completed'
      and activity.new_value = 'completed'
      and actor.role <> 'client'
  )
  update public.tickets ticket
     set status = 'assigned'
   where ticket.status = 'closed'
     and ticket.id in (select ticket_id from affected_tasks);

  with last_status_change as (
    select distinct on (a.task_id)
      a.task_id, a.actor_id, a.new_value
    from public.task_activity a
    where a.action = 'status_changed'
    order by a.task_id, a.created_at desc, a.id desc
  )
  update public.tasks task
     set status = 'client_review'
    from last_status_change activity
    join public.profiles actor on actor.id = activity.actor_id
   where task.id = activity.task_id
     and task.ticket_id is not null
     and task.status = 'completed'
     and activity.new_value = 'completed'
     and actor.role <> 'client';

  perform set_config('app.bypass_guard', coalesce(v_prior_bypass, ''), true);
  perform set_config('app.suppress_activity', coalesce(v_prior_suppress_activity, ''), true);
end
$$;

drop function if exists public.client_task_requires_review(uuid);

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

  select t.ticket_id, t.client_id, t.status
    into v_ticket_id, v_client_id, v_status
    from public.tasks t
   where t.id = p_task_id
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
  update public.tasks set status = 'completed' where id = p_task_id;
end
$$;

create or replace function public.client_request_task_changes(p_task_id uuid, p_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'Only the client can request task changes';
  end if;
  if p_feedback is null or length(trim(p_feedback)) = 0 or length(trim(p_feedback)) > 4000 then
    raise exception 'Feedback must be between 1 and 4000 characters';
  end if;

  select t.ticket_id, t.client_id, t.status
    into v_ticket_id, v_client_id, v_status
    from public.tasks t
   where t.id = p_task_id
   for update;
  if not found or v_ticket_id is null or v_client_id is distinct from my_client_id()
     or not can_see_ticket(v_ticket_id) then
    raise exception 'Task not found';
  end if;
  if v_status <> 'client_review' then
    raise exception 'Changes can only be requested while a task is in Client review';
  end if;
  if exists (select 1 from public.tickets where id = v_ticket_id and status = 'closed') then
    raise exception 'This ticket is closed';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks set status = 'changes_requested' where id = p_task_id;
  insert into public.task_comments (task_id, author_id, body, is_internal)
  values (p_task_id, v_uid, trim(p_feedback), false);
end
$$;

revoke execute on function public.client_approve_task(uuid) from anon, public;
grant execute on function public.client_approve_task(uuid) to authenticated;
revoke execute on function public.client_request_task_changes(uuid, text) from anon, public;
grant execute on function public.client_request_task_changes(uuid, text) to authenticated;
