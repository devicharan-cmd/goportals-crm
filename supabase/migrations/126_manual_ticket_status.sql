-- Ticket status is managed from the ticket, never inferred from linked tasks.
drop trigger if exists tasks_d_sync_ticket_status on public.tasks;
drop trigger if exists tasks_d_sync_ticket_progress on public.tasks;

create or replace function public.client_request_task_changes(
  p_task_id uuid,
  p_feedback text,
  p_attachments jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comment_id uuid;
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
  v_attachment jsonb;
  v_path text;
  v_prefix text;
  v_file_name text;
  v_size bigint;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'Only the client can request task changes';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'Attachments must be a list';
  end if;
  if length(trim(coalesce(p_feedback, ''))) > 4000 then
    raise exception 'Feedback cannot exceed 4000 characters';
  end if;
  if length(trim(coalesce(p_feedback, ''))) = 0
     and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'Write a message or attach a file';
  end if;

  select task.ticket_id, task.client_id, task.status
    into v_ticket_id, v_client_id, v_status
    from public.tasks task
    join public.tickets ticket on ticket.id = task.ticket_id
   where task.id = p_task_id
   for update of task;

  if not found or v_ticket_id is null or v_client_id is distinct from my_client_id()
     or not can_see_ticket(v_ticket_id) then
    raise exception 'Task not found';
  end if;
  if v_status not in ('client_review', 'completed') then
    raise exception 'Changes can only be requested while a task is in Client review or completed';
  end if;

  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 0 then
    perform set_config('app.allow_file_only_comment', 'on', true);
  end if;
  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks set status = 'changes_requested' where id = p_task_id;

  insert into public.task_comments (
    task_id, author_id, body, is_internal, is_change_request
  ) values (
    p_task_id, v_uid, trim(coalesce(p_feedback, '')), false, true
  )
  returning id into v_comment_id;

  v_prefix := p_task_id::text || '/chat/' || v_uid::text || '/';
  for v_attachment in
    select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_path := nullif(v_attachment->>'storage_path', '');
    v_file_name := nullif(trim(v_attachment->>'file_name'), '');
    v_size := nullif(v_attachment->>'size_bytes', '')::bigint;
    if v_path is null or left(v_path, length(v_prefix)) <> v_prefix
       or v_file_name is null or v_size is null or v_size < 0 then
      raise exception 'Invalid task attachment details';
    end if;
    insert into public.task_attachments (
      task_id, comment_id, uploaded_by, storage_path, file_name, mime_type, size_bytes
    ) values (
      p_task_id, v_comment_id, v_uid, v_path, v_file_name,
      nullif(v_attachment->>'mime_type', ''), v_size
    );
  end loop;

  return v_comment_id;
end
$$;

revoke execute on function public.client_request_task_changes(uuid, text, jsonb) from anon, public;
grant execute on function public.client_request_task_changes(uuid, text, jsonb) to authenticated;

-- Reopening is an explicit ticket action: it changes the ticket itself and
-- then returns any completed work to the team. Task changes alone do not
-- recalculate the ticket status.
create or replace function public.reopen_ticket(p_ticket_id uuid, p_feedback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_uid uuid := auth.uid();
  v_client uuid;
  v_status public.ticket_status;
  v_reopened integer;
begin
  select client_id, status into v_client, v_status
    from public.tickets
   where id = p_ticket_id
   for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_status <> 'closed' then
    raise exception 'Only a closed ticket can be reopened';
  end if;
  if v_role in ('super_admin', 'admin') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    if length(trim(coalesce(p_feedback, ''))) = 0 then
      raise exception 'Please tell us what needs to change before sending this back';
    end if;
  else
    raise exception 'Only the client or an admin can request changes';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets set status = 'assigned' where id = p_ticket_id;
  update public.tasks
     set status = 'changes_requested'
   where ticket_id = p_ticket_id and status = 'completed';
  get diagnostics v_reopened = row_count;
  if v_reopened = 0 then
    raise exception 'This ticket has no completed tasks to reopen';
  end if;

  if p_feedback is not null and length(trim(p_feedback)) > 0 then
    insert into public.ticket_comments (ticket_id, author_id, body, is_internal)
    values (p_ticket_id, v_uid, p_feedback, false);
  end if;
end
$$;

revoke execute on function public.reopen_ticket(uuid, text) from anon, public;
grant execute on function public.reopen_ticket(uuid, text) to authenticated;

create or replace function public.set_ticket_status(
  p_ticket_id uuid,
  p_status public.ticket_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prior_bypass text := current_setting('app.bypass_guard', true);
begin
  if auth_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can change ticket status';
  end if;
  if p_status is null then
    raise exception 'Choose a ticket status';
  end if;
  if p_status::text not in ('unassigned', 'assigned', 'closed') then
    raise exception 'Unsupported ticket status';
  end if;
  perform 1 from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets
     set status = p_status
   where id = p_ticket_id
     and status is distinct from p_status;
  perform set_config('app.bypass_guard', coalesce(v_prior_bypass, ''), true);
end
$$;

revoke execute on function public.set_ticket_status(uuid, public.ticket_status) from anon, public;
grant execute on function public.set_ticket_status(uuid, public.ticket_status) to authenticated;
