alter table public.task_attachments
  add column if not exists comment_id uuid references public.task_comments(id) on delete cascade;

create index if not exists task_attachments_comment_idx
  on public.task_attachments(comment_id) where comment_id is not null;

alter table public.task_comments
  drop constraint if exists task_comments_body_check;

create or replace function public.send_task_comment(
  p_task_id uuid,
  p_body text,
  p_is_internal boolean,
  p_attachments jsonb default '[]'::jsonb
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comment_id uuid;
  v_attachment jsonb;
  v_path text;
  v_prefix text;
  v_file_name text;
  v_size bigint;
begin
  if v_uid is null or not can_see_task(p_task_id) then
    raise exception 'Task not found';
  end if;
  if not is_staff() and auth_role() is distinct from 'client' then
    raise exception 'Your account is not allowed to send task messages';
  end if;
  if auth_role() = 'client' and p_is_internal then
    raise exception 'Client messages must be visible to the team';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'Attachments must be a list';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'Write a message or attach a file';
  end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 0 then
    perform set_config('app.allow_file_only_comment', 'on', true);
  end if;

  insert into public.task_comments (task_id, author_id, body, is_internal)
  values (p_task_id, v_uid, coalesce(trim(p_body), ''), coalesce(p_is_internal, false))
  returning id into v_comment_id;

  v_prefix := p_task_id::text || '/chat/' || v_uid::text || '/';
  for v_attachment in
    select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_path := nullif(v_attachment->>'storage_path', '');
    v_file_name := nullif(trim(v_attachment->>'file_name'), '');
    v_size := nullif(v_attachment->>'size_bytes', '')::bigint;
    if v_path is null or left(v_path, length(v_prefix)) <> v_prefix or v_file_name is null or v_size < 0 then
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

revoke execute on function public.send_task_comment(uuid, text, boolean, jsonb) from anon, public;
grant execute on function public.send_task_comment(uuid, text, boolean, jsonb) to authenticated;

drop function if exists public.client_request_task_changes(uuid, text);

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
  values (p_task_id, v_uid, trim(p_feedback), false)
  returning id into v_comment_id;

  v_prefix := p_task_id::text || '/chat/' || v_uid::text || '/';
  for v_attachment in
    select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_path := nullif(v_attachment->>'storage_path', '');
    v_file_name := nullif(trim(v_attachment->>'file_name'), '');
    v_size := nullif(v_attachment->>'size_bytes', '')::bigint;
    if v_path is null or left(v_path, length(v_prefix)) <> v_prefix or v_file_name is null or v_size < 0 then
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

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and can_see_task(task_id)
    and (
      length(trim(body)) > 0
      or current_setting('app.allow_file_only_comment', true) = 'on'
    )
    and (is_staff() or (auth_role() = 'client' and not is_internal))
  );

drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() and can_see_task(task_id));

drop policy if exists task_attachments_select on public.task_attachments;
create policy task_attachments_select on public.task_attachments for select to authenticated
  using (
    can_see_task(task_id)
    and (
      is_staff()
      or (
        exists (
          select 1 from public.tasks task
          where task.id = public.task_attachments.task_id
            and task.assignee_id = auth.uid()
        )
        or (
          comment_id is not null
          and exists (
            select 1 from public.task_comments comment
            where comment.id = public.task_attachments.comment_id
              and comment.task_id = public.task_attachments.task_id
              and not comment.is_internal
          )
        )
      )
    )
  );

drop policy if exists task_attachments_insert on public.task_attachments;
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and can_see_task(task_id)
    and (
      is_staff()
      or exists (
        select 1 from public.task_comments comment
        where comment.id = public.task_attachments.comment_id
          and comment.task_id = public.task_attachments.task_id
          and comment.author_id = auth.uid()
          and (is_staff() or not comment.is_internal)
      )
    )
  );

drop policy if exists task_attachments_delete on public.task_attachments;
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (
    can_see_task(task_id)
    and (
      (comment_id is not null and uploaded_by = auth.uid())
      or (
        comment_id is null
        and (uploaded_by = auth.uid() or is_super_admin())
        and (auth_role() <> 'client' or exists (
          select 1 from public.tasks task
          where task.id = public.task_attachments.task_id
            and task.assignee_id = auth.uid()
        ))
      )
    )
  );

drop policy if exists task_files_select on storage.objects;
create policy task_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'task-files'
    and can_see_task(try_uuid((storage.foldername(name))[1]))
    and (
      auth_role() <> 'client'
      or exists (
        select 1 from public.tasks task
        where task.id = try_uuid((storage.foldername(name))[1])
          and task.assignee_id = auth.uid()
      )
      or exists (
        select 1
        from public.task_attachments attachment
        join public.task_comments comment on comment.id = attachment.comment_id
        where attachment.storage_path = storage.objects.name
          and attachment.task_id = try_uuid((storage.foldername(name))[1])
          and not comment.is_internal
      )
    )
  );

drop policy if exists task_files_insert on storage.objects;
create policy task_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and can_see_task(try_uuid((storage.foldername(name))[1]))
    and (
      is_staff()
      or (
        (storage.foldername(name))[2] = 'chat'
        and (storage.foldername(name))[3] = auth.uid()::text
      )
    )
  );

drop policy if exists task_files_delete on storage.objects;
create policy task_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-files'
    and can_see_task(try_uuid((storage.foldername(name))[1]))
    and (
      (
        (storage.foldername(name))[2] = 'chat'
        and (storage.foldername(name))[3] = auth.uid()::text
      )
      or (
        (storage.foldername(name))[2] <> 'chat'
        and exists (
          select 1 from public.task_attachments attachment
          join public.tasks task on task.id = attachment.task_id
          where attachment.storage_path = storage.objects.name
            and (
              attachment.uploaded_by = auth.uid()
              or (is_super_admin() and auth_role() <> 'client')
            )
            and (auth_role() <> 'client' or task.assignee_id = auth.uid())
        )
      )
    )
  );
