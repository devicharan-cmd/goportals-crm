create index if not exists task_activity_assignee_history_idx
  on public.task_activity (old_value, created_at desc)
  where action = 'assignee_changed';

create or replace function public.is_former_task_assignee(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and exists (
        select 1
        from public.task_activity activity
        where activity.task_id = t.id
          and activity.action = 'assignee_changed'
          and activity.old_value = auth.uid()::text
      )
      and auth.uid() is distinct from t.assignee_id
      and auth.uid() is distinct from t.assigned_by
  )
$$;

revoke all on function public.is_former_task_assignee(uuid) from public, anon;
grant execute on function public.is_former_task_assignee(uuid) to authenticated;

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when auth_role() = 'client' then
        t.visibility = 'public'
        and t.client_id = my_client_id()
        and (t.ticket_id is null or can_see_ticket(t.ticket_id))
      when auth_role() in ('manager', 'team_lead')
       and t.assignee_id is not null
       and exists (
         with recursive reports(id) as (
           select p.id
           from public.profiles p
           where p.reporting_to = auth.uid()
           union
           select child.id
           from public.profiles child
           join reports parent on child.reporting_to = parent.id
         )
         select 1 from reports where id = t.assignee_id
       ) then true
      when auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
       and (
         t.assignee_id = auth.uid()
         or t.assigned_by = auth.uid()
         or exists (
           select 1
           from public.task_activity activity
           where activity.task_id = t.id
             and activity.action = 'assignee_changed'
             and activity.actor_id = auth.uid()
         )
       ) then true
      else task_visible(
        t.client_id, t.department_id, t.assignee_id, t.created_by,
        t.is_urgent, t.status, t.assigned_by
      )
    end
    from public.tasks t
    where t.id = p_task_id
  ), false)
$$;

create or replace function public.guard_assignee_task_edits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role := auth_role();
begin
  if v_uid is null
     or v_role is null
     or v_role = 'client'
     or current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

  if public.is_former_task_assignee(old.id) then
    raise exception 'Former assignees can view but cannot modify this task';
  end if;

  if old.assigned_by = v_uid
     or (old.assigned_by is null and old.assignee_id is null and old.created_by = v_uid) then
    return new;
  end if;

  if not only_changed(to_jsonb(old), to_jsonb(new), array['status', 'updated_at']) then
    raise exception 'Only the person who assigned this task can edit it';
  end if;

  return new;
end
$$;

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (
    not public.is_former_task_assignee(id)
    and (
      assigned_by = auth.uid()
      or (assigned_by is null and assignee_id is null and created_by = auth.uid())
    )
  );

-- Return only assignee history for tasks the caller may already view.
create or replace function public.task_assignee_history(p_task_ids uuid[])
returns table (
  task_id uuid,
  profile_id uuid,
  full_name text,
  avatar_url text,
  role app_role,
  assigned_at timestamptz,
  is_current boolean
)
language sql stable security definer set search_path = public as $$
  with requested as (
    select distinct requested_id
    from unnest(p_task_ids) as requested(requested_id)
  ),
  visible_tasks as (
    select t.id, t.assignee_id, t.assigned_at
    from public.tasks t
    join requested r on r.requested_id = t.id
    where public.can_see_task(t.id)
  ),
  assignments as (
    select t.id as task_id, t.assignee_id as profile_id, t.assigned_at, true as is_current
    from visible_tasks t
    where t.assignee_id is not null

    union all

    select
      t.id, public.try_uuid(activity.old_value), activity.created_at, false
    from visible_tasks t
    join public.task_activity activity on activity.task_id = t.id
    where activity.action = 'assignee_changed'
      and public.try_uuid(activity.old_value) is not null
      and public.try_uuid(activity.old_value) is distinct from t.assignee_id
  ),
  ranked_assignments as (
    select a.*,
           row_number() over (
             partition by a.task_id, a.profile_id
             order by a.is_current desc, a.assigned_at desc nulls last
           ) as assignment_rank
    from assignments a
  )
  select a.task_id, a.profile_id,
         coalesce(p.full_name, 'Former assignee'),
         p.avatar_url, p.role, a.assigned_at, a.is_current
  from ranked_assignments a
  left join public.profiles p on p.id = a.profile_id
  where a.assignment_rank = 1
  order by a.task_id, a.is_current desc, a.assigned_at desc nulls last
$$;

revoke all on function public.task_assignee_history(uuid[]) from public, anon;
grant execute on function public.task_assignee_history(uuid[]) to authenticated;

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and can_see_task(task_id)
    and not public.is_former_task_assignee(task_id)
    and (
      length(trim(body)) > 0
      or current_setting('app.allow_file_only_comment', true) = 'on'
    )
    and (is_staff() or (auth_role() = 'client' and not is_internal))
  );

drop policy if exists task_comments_update on public.task_comments;
create policy task_comments_update on public.task_comments for update to authenticated
  using (
    author_id = auth.uid()
    and not public.is_former_task_assignee(task_id)
    and (
      is_staff()
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.assignee_id = auth.uid()
      )
    )
  )
  with check (
    author_id = auth.uid()
    and not public.is_former_task_assignee(task_id)
    and (
      is_staff()
      or (
        not is_internal
        and exists (
          select 1 from public.tasks t
          where t.id = task_id and t.assignee_id = auth.uid()
        )
      )
    )
  );

drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (
    author_id = auth.uid()
    and can_see_task(task_id)
    and not public.is_former_task_assignee(task_id)
  );

drop policy if exists task_attachments_insert on public.task_attachments;
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and can_see_task(task_id)
    and not public.is_former_task_assignee(task_id)
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
    and not public.is_former_task_assignee(task_id)
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

drop policy if exists time_logs_insert on public.time_logs;
create policy time_logs_insert on public.time_logs for insert to authenticated
  with check (
    is_staff()
    and profile_id = auth.uid()
    and can_see_task(task_id)
    and not public.is_former_task_assignee(task_id)
  );

drop policy if exists time_logs_update on public.time_logs;
create policy time_logs_update on public.time_logs for update to authenticated
  using (
    (profile_id = auth.uid() or is_super_admin())
    and not public.is_former_task_assignee(task_id)
  )
  with check (
    (profile_id = auth.uid() or is_super_admin())
    and not public.is_former_task_assignee(task_id)
  );

drop policy if exists time_logs_delete on public.time_logs;
create policy time_logs_delete on public.time_logs for delete to authenticated
  using (
    (profile_id = auth.uid() or is_super_admin())
    and not public.is_former_task_assignee(task_id)
  );

drop policy if exists task_checklist_items_insert on public.task_checklist_items;
create policy task_checklist_items_insert on public.task_checklist_items for insert to authenticated
  with check (
    not public.is_former_task_assignee(task_id)
    and (auth_role() = 'super_admin' or can_edit_task_checklist(task_id))
  );

drop policy if exists task_checklist_items_update on public.task_checklist_items;
create policy task_checklist_items_update on public.task_checklist_items for update to authenticated
  using (
    not public.is_former_task_assignee(task_id)
    and (auth_role() = 'super_admin' or can_edit_task_checklist(task_id))
  )
  with check (
    not public.is_former_task_assignee(task_id)
    and (auth_role() = 'super_admin' or can_edit_task_checklist(task_id))
  );

drop policy if exists task_checklist_items_delete on public.task_checklist_items;
create policy task_checklist_items_delete on public.task_checklist_items for delete to authenticated
  using (
    not public.is_former_task_assignee(task_id)
    and (auth_role() = 'super_admin' or can_edit_task_checklist(task_id))
  );

drop policy if exists task_files_insert on storage.objects;
create policy task_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and (
      (
        can_see_task(public.try_uuid((storage.foldername(name))[1]))
        and not public.is_former_task_assignee(public.try_uuid((storage.foldername(name))[1]))
      )
      or public.can_upload_scheduled_task_file(public.try_uuid((storage.foldername(name))[1]))
    )
  );

drop policy if exists task_files_delete on storage.objects;
create policy task_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-files'
    and can_see_task(public.try_uuid((storage.foldername(name))[1]))
    and not public.is_former_task_assignee(public.try_uuid((storage.foldername(name))[1]))
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
