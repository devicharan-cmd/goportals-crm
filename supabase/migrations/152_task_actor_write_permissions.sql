-- Only the task assignee or assigner may change task status.
-- Client workflow and trusted internal RPCs retain their existing guards.
create or replace function public.guard_task_status_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or auth_role() = 'client' then
    return new;
  end if;

  if auth.uid() is distinct from old.assignee_id
     and auth.uid() is distinct from old.assigned_by then
    raise exception 'Only the assignee or the person who assigned this task can change its status';
  end if;

  return new;
end
$$;

-- Only the assigner can edit task fields; an assignee may submit status-only updates.
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
    assigned_by = auth.uid()
    or (assigned_by is null and assignee_id is null and created_by = auth.uid())
  );

-- Keep task workflow checks intact while allowing the assigner to submit
-- status-only updates when their role-specific scope check would otherwise
-- reject the task.
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
  v_client_assignee_allowed boolean := false;
  v_status_only boolean := false;
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
        if new.visibility <> 'public'
           or not public.can_assign_public_task_client(new.ticket_id, new.client_id, new.assignee_id) then
          raise exception 'Only staff who can access the selected client can assign its active account to a public task';
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

  if new.assignee_id is distinct from old.assignee_id then
    select p.role into v_assignee_role
      from public.profiles p
     where p.id = new.assignee_id and p.status = 'active';
    if v_assignee_role = 'client' then
      v_client_assignee_allowed :=
        new.visibility = 'public'
        and new.ticket_id is not distinct from old.ticket_id
        and new.client_id is not distinct from old.client_id
        and public.can_assign_public_task_client(new.ticket_id, new.client_id, new.assignee_id);
    end if;
  end if;

  v_status_only :=
    new.status is distinct from old.status
    and only_changed(to_jsonb(old), to_jsonb(new), array['status', 'updated_at']);

  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status not in ('completed', 'cancelled')
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'employee' then
    if not v_is_claim then
      if not (coalesce(old.assignee_id = v_uid, false)
           or (coalesce(old.assigned_by = v_uid, false) and v_status_only)
           or coalesce(old.created_by = v_uid, false)) then
        raise exception 'You can only update tasks assigned to you';
      end if;
      if new.is_urgent is distinct from old.is_urgent then
        raise exception 'Only managers and super admins can mark tasks urgent';
      end if;
      if new.assignee_id is distinct from old.assignee_id and not v_client_assignee_allowed then
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
               or (coalesce(old.assigned_by = v_uid, false) and v_status_only)
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
    if v_assignee_role = 'client' then
      if not v_client_assignee_allowed then
        raise exception 'Only staff who can access the selected client can assign its active account to a public task';
      end if;
    elsif not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tasks to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  return new;
end
$$;
