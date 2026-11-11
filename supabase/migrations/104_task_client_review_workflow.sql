-- Keep direct task-row visibility limited to client-assigned tasks. Ticket
-- tasks handled by staff are exposed to clients through a safe, read-only RPC.

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when auth_role() = 'client' then
        t.ticket_id is not null
        and t.client_id = my_client_id()
        and can_see_ticket(t.ticket_id)
      else task_visible(
        t.client_id, t.department_id, t.assignee_id, t.created_by,
        t.is_urgent, t.status, t.assigned_by
      )
    end
    from public.tasks t
    where t.id = p_task_id
  ), false)
$$;

create or replace function public.client_ticket_tasks(
  p_task_id uuid default null,
  p_task_number integer default null
) returns table (
  id uuid,
  task_number integer,
  title text,
  description text,
  status public.task_status,
  priority public.task_priority,
  is_urgent boolean,
  source public.task_source,
  due_date date,
  assignee_id uuid,
  assigned_by uuid,
  client jsonb,
  platform jsonb,
  department jsonb,
  created_at timestamptz,
  ticket_id uuid,
  ticket jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() is distinct from 'client' then
    raise exception 'This view is only available to client accounts';
  end if;

  return query
  select
    t.id,
    t.task_number,
    t.title,
    case when t.assignee_id = auth.uid() then t.description else null end,
    t.status,
    t.priority,
    t.is_urgent,
    t.source,
    t.due_date,
    t.assignee_id,
    null::uuid,
    jsonb_build_object('company_name', c.company_name),
    case when p.id is null then null else jsonb_build_object('name', p.name) end,
    case when d.id is null then null else jsonb_build_object('name', d.name) end,
    t.created_at,
    t.ticket_id,
    case when k.id is null then null
         else jsonb_build_object('id', k.id, 'ticket_number', k.ticket_number, 'subject', k.subject)
    end
  from public.tasks t
  join public.clients c on c.id = t.client_id
  left join public.platforms p on p.id = t.platform_id
  left join public.departments d on d.id = t.department_id
  left join public.tickets k on k.id = t.ticket_id
  where t.ticket_id is not null
    and t.client_id = my_client_id()
    and can_see_ticket(t.ticket_id)
    and (p_task_id is null or t.id = p_task_id)
    and (p_task_number is null or t.task_number = p_task_number)
  order by t.created_at desc;
end
$$;

revoke execute on function public.client_ticket_tasks(uuid, integer) from anon, public;
grant execute on function public.client_ticket_tasks(uuid, integer) to authenticated;

-- Clients may only edit tasks assigned to their own profile. Review stages
-- are handled by the approval/request-changes RPCs below.
create or replace function public.guard_task_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_uid uuid := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
  v_assignee_role app_role;
  v_ticket_client uuid;
  v_ticket_status public.ticket_status;
begin
  if v_uid is null or current_setting('app.bypass_guard', true) = 'on' then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if v_role = 'client' then
    if tg_op <> 'UPDATE'
       or old.assignee_id is distinct from v_uid
       or old.client_id is distinct from my_client_id()
       or old.ticket_id is null then
      raise exception 'You can only respond to tasks assigned to your client account';
    end if;
    if old.status in ('completed', 'cancelled') then
      raise exception 'This task is no longer open for updates';
    end if;
    if old.status = 'client_review' then
      raise exception 'Use Approve task or Request changes to respond to client review';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new), array['status', 'updated_at']) then
      raise exception 'You can only update the status of a task assigned to your client account';
    end if;
    if new.status not in ('todo', 'in_progress', 'in_system_process', 'ready_for_review') then
      raise exception 'Submit your task for review when your response is ready';
    end if;
    if not can_see_ticket(old.ticket_id) or exists (
      select 1 from public.tickets t where t.id = old.ticket_id and t.status = 'closed'
    ) then
      raise exception 'This ticket is closed';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;
    new.source := 'internal';
    if new.is_urgent and v_role = 'employee' then
      raise exception 'Only managers and super admins can mark tasks urgent';
    end if;

    if new.ticket_id is not null then
      select t.client_id, t.status
        into v_ticket_client, v_ticket_status
        from public.tickets t
       where t.id = new.ticket_id;
      if not found or v_ticket_client is distinct from new.client_id then
        raise exception 'The ticket must belong to the selected client';
      end if;
      if v_ticket_status = 'closed' then
        raise exception 'This ticket is closed';
      end if;
      if not can_see_ticket(new.ticket_id) then
        raise exception 'You cannot create tasks for this ticket';
      end if;
    end if;

    if new.assignee_id is not null then
      select p.role into v_assignee_role
        from public.profiles p
       where p.id = new.assignee_id and p.status = 'active';
      if v_assignee_role = 'client' then
        if v_role not in ('super_admin', 'manager', 'team_lead')
           or new.ticket_id is null
           or not exists (
             select 1
               from public.clients c
               join public.profiles p on p.id = c.owner_id
              where c.id = new.client_id
                and c.owner_id = new.assignee_id
                and p.role = 'client'
                and p.status = 'active'
           ) then
          raise exception 'Only managers, team leads, and super admins can assign ticket tasks to its active client';
        end if;
      elsif not can_assign(new.assignee_id) then
        raise exception 'You cannot assign tasks to this person';
      end if;
      new.assigned_by := v_uid;
      new.assigned_at := now();
    end if;

    if new.department_id is null and new.service_id is not null then
      new.department_id := (select department_id from public.services where id = new.service_id);
    end if;
    return new;
  end if;

  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status not in ('completed', 'cancelled')
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'employee' then
    if not v_is_claim then
      if not (coalesce(old.assignee_id = v_uid, false) or coalesce(old.created_by = v_uid, false)) then
        raise exception 'You can only update tasks assigned to you';
      end if;
      if new.is_urgent is distinct from old.is_urgent then
        raise exception 'Only managers and super admins can mark tasks urgent';
      end if;
      if new.assignee_id is distinct from old.assignee_id then
        raise exception 'Only managers and super admins can change the assignee';
      end if;
      if new.due_date is distinct from old.due_date then
        raise exception 'Only managers and super admins can change the due date';
      end if;
      if new.status is distinct from old.status and new.status in ('client_review', 'completed', 'changes_requested') then
        raise exception 'Only a team lead or manager can move a task to Client review, mark it completed, or request changes';
      end if;
    end if;
  elsif v_role = 'team_lead' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id);
    if not v_in_scope and not v_is_claim then
      raise exception 'This task is outside your scope — you can only claim it if it is urgent and unassigned';
    end if;
  end if;

  if new.status = 'client_review'
     and old.status is distinct from new.status
     and old.status <> 'ready_for_review' then
    raise exception 'Move the task to In review before Client review';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tasks to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
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

-- Parent ticket status reflects whether work is with the team or the client.
create or replace function public.sync_ticket_progress_from_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_ticket_status public.ticket_status;
  v_total integer;
  v_done integer;
  v_client_review integer;
  v_team_review integer;
  v_reviewable integer;
  v_todo integer;
  v_target public.ticket_status;
begin
  v_ticket_id := case when tg_op = 'DELETE' then old.ticket_id else new.ticket_id end;
  if v_ticket_id is null then return null; end if;

  select status into v_ticket_status from public.tickets where id = v_ticket_id;
  if not found or v_ticket_status = 'closed' then return null; end if;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'client_review'),
         count(*) filter (where status = 'ready_for_review'),
         count(*) filter (where status in ('ready_for_review', 'client_review', 'completed')),
         count(*) filter (where status = 'todo')
    into v_total, v_done, v_client_review, v_team_review, v_reviewable, v_todo
    from public.tasks
   where ticket_id = v_ticket_id;

  if v_total = 0 then return null;
  elsif v_done = v_total then v_target := 'resolved';
  elsif v_client_review > 0 and v_client_review + v_done = v_total then v_target := 'ready_for_client';
  elsif v_team_review + v_client_review > 0 and v_reviewable = v_total then v_target := 'ready_for_review';
  elsif v_todo = v_total then v_target := 'assigned';
  else v_target := 'in_progress';
  end if;

  if v_target <> v_ticket_status then
    perform set_config('app.bypass_guard', 'on', true);
    update public.tickets set status = v_target where id = v_ticket_id;
  end if;
  return null;
end
$$;

-- Task children stay visible to the client for their tickets, but clients may
-- only create or remove comments/files on tasks assigned to their own profile.
drop policy if exists task_checklist_items_select on public.task_checklist_items;
create policy task_checklist_items_select on public.task_checklist_items for select to authenticated
  using (
    can_see_task(task_id)
    and (
      auth_role() <> 'client'
      or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
    )
  );

drop policy if exists task_attachments_select on public.task_attachments;
create policy task_attachments_select on public.task_attachments for select to authenticated
  using (
    can_see_task(task_id)
    and (
      auth_role() <> 'client'
      or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
    )
  );

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and can_see_task(task_id)
    and (
      is_staff()
      or (
        auth_role() = 'client'
        and not is_internal
        and exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
      )
    )
  );

drop policy if exists task_comments_update on public.task_comments;
create policy task_comments_update on public.task_comments for update to authenticated
  using (
    author_id = auth.uid()
    and (
      is_staff()
      or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
    )
  )
  with check (
    author_id = auth.uid()
    and (
      is_staff()
      or (
        not is_internal
        and exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
      )
    )
  );

drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (
    is_super_admin()
    or (
      author_id = auth.uid()
      and (
        is_staff()
        or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
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
      or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
    )
  );

drop policy if exists task_attachments_delete on public.task_attachments;
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (
    is_super_admin()
    or (
      uploaded_by = auth.uid()
      and (
        is_staff()
        or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
      )
    )
  );

drop policy if exists task_files_insert on storage.objects;
drop policy if exists task_files_select on storage.objects;
create policy task_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'task-files'
    and can_see_task(try_uuid((storage.foldername(name))[1]))
    and (
      auth_role() <> 'client'
      or exists (
        select 1 from public.tasks t
         where t.id = try_uuid((storage.foldername(name))[1])
           and t.assignee_id = auth.uid()
      )
    )
  );

create policy task_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and can_see_task(try_uuid((storage.foldername(name))[1]))
    and (
      is_staff()
      or exists (
        select 1 from public.tasks t
         where t.id = try_uuid((storage.foldername(name))[1])
           and t.assignee_id = auth.uid()
      )
    )
  );

drop policy if exists task_files_delete on storage.objects;
create policy task_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-files'
    and (
      is_super_admin()
      or exists (
        select 1 from public.task_attachments a
        join public.tasks t on t.id = a.task_id
        where a.storage_path = storage.objects.name
          and a.uploaded_by = auth.uid()
          and (auth_role() <> 'client' or t.assignee_id = auth.uid())
      )
    )
  );
