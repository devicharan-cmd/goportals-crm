-- Allow ticket-visible staff to assign tasks to the client who owns the ticket.
-- The client must still be the active owner of that ticket's client account.

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
    if not only_changed(to_jsonb(old), to_jsonb(new), array['status', 'updated_at']) then
      raise exception 'You can only update the status of a task assigned to your client account';
    end if;
    if new.status not in ('todo', 'in_progress', 'ready_for_review') then
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
      raise exception 'Only managers and admins can mark tasks urgent';
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
        if v_role not in ('super_admin', 'admin', 'team_lead')
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
          raise exception 'Only admins, team leads, and super admins can assign ticket tasks to its active client';
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
        raise exception 'Only managers and admins can mark tasks urgent';
      end if;
      if new.assignee_id is distinct from old.assignee_id then
        raise exception 'Only managers and admins can change the assignee';
      end if;
      if new.due_date is distinct from old.due_date then
        raise exception 'Only managers and admins can change the due date';
      end if;
      if new.status is distinct from old.status and new.status in ('completed', 'changes_requested') then
        raise exception 'Only a team lead or admin can mark a task completed or request changes — move it to Ready for review instead';
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
