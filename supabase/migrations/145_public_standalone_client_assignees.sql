-- Allow the active client owner to be assigned to any public task for their
-- client, including standalone tasks, when the acting staff member can see it.
create or replace function public.can_assign_public_task_client(
  p_ticket_id uuid,
  p_client_id uuid,
  p_assignee_id uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
    and exists (
      select 1
      from public.clients c
      join public.profiles p on p.id = c.owner_id
      where c.id = p_client_id
        and c.owner_id = p_assignee_id
        and p.role = 'client'
        and p.status = 'active'
    )
    and case
      when p_ticket_id is null then public.can_see_client(p_client_id)
      else exists (
        select 1
        from public.tickets t
        where t.id = p_ticket_id
          and t.client_id = p_client_id
          and t.status <> 'closed'
          and public.can_see_ticket(t.id)
      )
    end,
    false
  )
$$;

revoke all on function public.can_assign_public_task_client(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.can_assign_ticket_client_task(
  p_ticket_id uuid,
  p_client_id uuid,
  p_assignee_id uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_assign_public_task_client(p_ticket_id, p_client_id, p_assignee_id)
$$;

revoke all on function public.can_assign_ticket_client_task(uuid, uuid, uuid) from public, anon, authenticated;

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
