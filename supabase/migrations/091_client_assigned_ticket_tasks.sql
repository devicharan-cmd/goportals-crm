-- Allow a client to work on a task explicitly assigned to their own profile.
-- Such tasks can only be created under an open ticket by a staff member who
-- already has an active task assigned on that same ticket.

create or replace function public.task_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status public.task_status,
  p_assigned_by uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when auth_role() = 'client' then
        p_assignee_id = auth.uid() and p_client_id = my_client_id()
      when exists (
        select 1 from public.profiles p
        where p.id = p_assigned_by and p.role = 'super_admin'
      ) then auth.uid() in (p_assigned_by, p_assignee_id)
      when exists (
        select 1 from public.profiles p
        where p.id = p_assignee_id and p.role = 'super_admin'
      ) then p_assignee_id = auth.uid()
      else case auth_role()
        when 'super_admin' then true
        when 'admin' then p_assignee_id is not null
        when 'team_lead' then
             p_assignee_id is not null
          and (
               p_assignee_id = auth.uid()
            or p_created_by = auth.uid()
            or (p_department_id is not null and manages_department(p_department_id))
            or manager_covers_client(p_client_id)
          )
        when 'employee' then p_assignee_id = auth.uid()
        else false
      end
    end,
    false
  )
$$;

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select task_visible(
      t.client_id, t.department_id, t.assignee_id, t.created_by,
      t.is_urgent, t.status, t.assigned_by
    ) and (auth_role() <> 'client' or t.ticket_id is not null)
    from public.tasks t where t.id = p_task_id
  ), false)
$$;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by)
    and (auth_role() <> 'client' or ticket_id is not null)
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (
    task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by)
    and (auth_role() <> 'client' or ticket_id is not null)
  )
  with check (true);

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
           )
           or not exists (
             select 1 from public.tasks existing
              where existing.ticket_id = new.ticket_id
                and existing.assignee_id = v_uid
                and existing.status not in ('completed', 'cancelled')
           ) then
          raise exception 'Only a staff member assigned to an active task on this ticket can assign a task to its client';
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

create or replace function public.ticket_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status public.ticket_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'team_lead' then
         p_assignee_id = auth.uid()
      or p_created_by = auth.uid()
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
      or exists (
        select 1 from public.tasks t
         where t.client_id = p_client_id
           and (t.assignee_id = auth.uid()
             or t.created_by = auth.uid()
             or (t.department_id is not null and manages_department(t.department_id)))
      )
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select ticket_visible(
      t.client_id, t.department_id, t.assignee_id, t.created_by,
      t.is_urgent, t.status
    )
    from public.tickets t where t.id = p_ticket_id
  ), false)
$$;

drop policy if exists task_checklist_items_select on public.task_checklist_items;
create policy task_checklist_items_select on public.task_checklist_items for select to authenticated
  using (is_staff() and can_see_task(task_id));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and (ticket_id is null or can_see_ticket(ticket_id)));

create or replace function public.send_ticket_comment(
  p_ticket_id uuid,
  p_body text,
  p_is_internal boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role := auth_role();
  v_ticket public.tickets%rowtype;
  v_comment_id uuid;
begin
  if v_uid is null or v_role is null then
    raise exception 'You must be signed in with an active account';
  end if;
  if p_body is null or trim(p_body) = '' then
    raise exception 'Message cannot be empty';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or not public.can_see_ticket(p_ticket_id) then
    raise exception 'You cannot access this ticket';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This ticket is closed';
  end if;

  if v_role = 'client' then
    if v_ticket.client_id is distinct from public.my_client_id() then
      raise exception 'You can only reply to your own tickets';
    end if;
    p_is_internal := false;
  elsif v_role in ('super_admin', 'admin') then
    null;
  elsif v_role = 'team_lead' then
    if not p_is_internal then
      raise exception 'Team leads can only send internal ticket messages';
    end if;
    p_is_internal := true;
  else
    raise exception 'Only managers, Super Admins, Team Leads, and the ticket client can message on tickets';
  end if;

  insert into public.ticket_comments (ticket_id, author_id, body, is_internal)
  values (p_ticket_id, v_uid, trim(p_body), p_is_internal)
  returning id into v_comment_id;

  return v_comment_id;
end
$$;

revoke execute on function public.send_ticket_comment(uuid, text, boolean) from public, anon;
grant execute on function public.send_ticket_comment(uuid, text, boolean) to authenticated;
