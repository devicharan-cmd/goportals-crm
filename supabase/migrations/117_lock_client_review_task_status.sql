-- Client review can only be resolved by client review actions.
-- Staff may not set Changes requested or Completed directly.
create or replace function public.guard_client_review_task_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

  if auth_role() = 'client' then
    return new;
  end if;

  if old.status = 'client_review' then
    raise exception 'Only the client can respond while a task is in Client review';
  end if;

  if new.status = 'changes_requested' then
    raise exception 'Only the client can request changes during Client review';
  end if;

  if new.status = 'completed' then
    raise exception 'Only the client can approve a task from Client review';
  end if;

  return new;
end
$$;

drop trigger if exists tasks_guard_client_review_status on public.tasks;
create trigger tasks_guard_client_review_status
  before update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.guard_client_review_task_status();

-- A previous staff status update may already have incorrectly marked a task
-- completed. Let its client review or send it back, but not unrelated clients.
create or replace function public.client_task_requires_review(p_task_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
  v_last_actor uuid;
  v_last_value text;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'This review check is only available to client accounts';
  end if;

  select t.ticket_id, t.client_id, t.status
    into v_ticket_id, v_client_id, v_status
    from public.tasks t
   where t.id = p_task_id;
  if not found or v_ticket_id is null or v_client_id is distinct from my_client_id()
     or not can_see_ticket(v_ticket_id) then
    raise exception 'Task not found';
  end if;
  if v_status <> 'completed' then
    return false;
  end if;

  select a.actor_id, a.new_value
    into v_last_actor, v_last_value
    from public.task_activity a
   where a.task_id = p_task_id and a.action = 'status_changed'
   order by a.created_at desc, a.id desc
   limit 1;

  return coalesce(v_last_value = 'completed' and exists (
    select 1 from public.profiles p
     where p.id = v_last_actor and p.role <> 'client'
  ), false);
end
$$;

revoke execute on function public.client_task_requires_review(uuid) from anon, public;
grant execute on function public.client_task_requires_review(uuid) to authenticated;

create or replace function public.client_approve_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
  v_last_actor uuid;
  v_last_value text;
  v_completed_by_staff boolean := false;
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
  if v_status = 'completed' then
    select a.actor_id, a.new_value
      into v_last_actor, v_last_value
      from public.task_activity a
     where a.task_id = p_task_id and a.action = 'status_changed'
     order by a.created_at desc, a.id desc
     limit 1;
    v_completed_by_staff := v_last_value = 'completed' and exists (
      select 1 from public.profiles p
       where p.id = v_last_actor and p.role <> 'client'
    );
  end if;
  if v_status <> 'client_review' and not v_completed_by_staff then
    raise exception 'Only a task in Client review can be approved';
  end if;
  if exists (select 1 from public.tickets where id = v_ticket_id and status = 'closed') then
    raise exception 'This ticket is closed';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  if v_completed_by_staff then
    update public.tasks set status = 'client_review' where id = p_task_id;
  end if;
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
  v_last_actor uuid;
  v_last_value text;
  v_completed_by_staff boolean := false;
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
  if v_status = 'completed' then
    select a.actor_id, a.new_value
      into v_last_actor, v_last_value
      from public.task_activity a
     where a.task_id = p_task_id and a.action = 'status_changed'
     order by a.created_at desc, a.id desc
     limit 1;
    v_completed_by_staff := v_last_value = 'completed' and exists (
      select 1 from public.profiles p
       where p.id = v_last_actor and p.role <> 'client'
    );
  end if;
  if v_status <> 'client_review' and not v_completed_by_staff then
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
