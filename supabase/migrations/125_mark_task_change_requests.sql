alter table public.task_comments
  add column if not exists is_change_request boolean not null default false;

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
  v_ticket_status public.ticket_status;
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

  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 0 then
    perform set_config('app.allow_file_only_comment', 'on', true);
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  if v_ticket_status = 'closed' then
    update public.tickets set status = 'assigned' where id = v_ticket_id;
  end if;
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
