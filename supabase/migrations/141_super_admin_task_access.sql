-- Super admins have the same company-wide task visibility and assignment
-- options regardless of who created or assigned a task.

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
      when auth_role() = 'super_admin' then true
      when p_assigned_by = auth.uid() then
        case auth_role()
          when 'team_lead' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and exists (
              select 1 from public.profiles p
              where p.id = p_assignee_id and (p.status = 'active' or p.role = 'client')
                and p.role in ('employee', 'super_admin', 'client')
                and (
                  p.role = 'super_admin'
                  or p.role = 'client' and exists (
                    select 1 from public.clients c
                    where c.id = p_client_id and c.owner_id = p_assignee_id
                  )
                  or p.role = 'employee' and exists (
                    with recursive descendants(id) as (
                      select id from public.profiles where reporting_to = auth.uid()
                      union
                      select p.id from public.profiles p
                      join descendants d on p.reporting_to = d.id
                    )
                    select 1 from descendants where id = p_assignee_id
                  )
                )
            )
          when 'manager' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and (
              can_assign(p_assignee_id) or exists (
                select 1 from public.profiles p
                where p.id = p_assignee_id and p.status = 'active'
                  and p.role = 'super_admin'
              ) or exists (
                select 1 from public.clients c
                join public.profiles p on p.id = c.owner_id
                where c.id = p_client_id and c.owner_id = p_assignee_id
                  and p.role = 'client' and p.status = 'active'
              )
            )
          when 'employee' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and (
              can_assign(p_assignee_id) or exists (
                select 1 from public.profiles p
                where p.id = p_assignee_id and p.status = 'active'
                  and p.role = 'super_admin'
              )
            )
          else false
        end
      when exists (
        select 1 from public.profiles p
        where p.id = p_assigned_by and p.role = 'super_admin'
      ) then auth.uid() in (p_assigned_by, p_assignee_id)
      when exists (
        select 1 from public.profiles p
        where p.id = p_assignee_id and p.role = 'super_admin'
      ) then p_assignee_id = auth.uid()
      else case auth_role()
        when 'manager' then p_assignee_id is not null
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

create or replace function public.can_assign(p_assignee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_assignee is null then true
    when auth.uid() is null then true
    when not exists (
      select 1
      from public.profiles
      where id = p_assignee
        and status = 'active'
        and role in ('super_admin', 'manager', 'team_lead', 'employee')
    ) then false
    when auth_role() = 'super_admin' then true
    when auth_role() = 'manager' then
      exists (
        select 1
        from public.profiles
        where id = p_assignee
          and status = 'active'
          and role = 'super_admin'
      )
      or exists (
        with recursive reports(id) as (
          select id
          from public.profiles
          where id = auth.uid()

          union

          select child.id
          from public.profiles child
          join reports parent on child.reporting_to = parent.id
        )
        select 1
        from reports
        where id = p_assignee
          and id <> auth.uid()
      )
    when p_assignee = auth.uid() then true
    else exists (
      with recursive ancestors(id, reporting_to) as (
        select id, reporting_to
        from public.profiles
        where id = auth.uid()

        union

        select parent.id, parent.reporting_to
        from public.profiles parent
        join ancestors child on child.reporting_to = parent.id
      ),
      hierarchy(id) as (
        select id from ancestors

        union

        select child.id
        from public.profiles child
        join hierarchy parent on child.reporting_to = parent.id
      )
      select 1
      from hierarchy
      where id = p_assignee
    )
  end
$$;

  -- Keep ticket-linked client assignments valid when staff reassigns an existing
  -- task, not only when the task is first inserted.
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
             or new.visibility <> 'public'
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
            raise exception 'Only managers, team leads, and super admins can assign public ticket tasks to their active client';
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
      select p.role into v_assignee_role
        from public.profiles p
       where p.id = new.assignee_id and p.status = 'active';
      if v_assignee_role = 'client' then
        if v_role not in ('super_admin', 'manager', 'team_lead')
           or new.visibility <> 'public'
           or new.ticket_id is null
           or not exists (
             select 1
               from public.tickets t
               join public.clients c on c.id = t.client_id
               join public.profiles p on p.id = c.owner_id
              where t.id = new.ticket_id
                and t.client_id = new.client_id
                and t.status <> 'closed'
                and c.owner_id = new.assignee_id
                and p.role = 'client'
                and p.status = 'active'
           ) then
          raise exception 'Only managers, team leads, and super admins can assign public ticket tasks to their active client';
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

  -- Scheduled tasks use the same client-owner restrictions as direct task writes.
  create or replace function public.create_task_schedule(
    p_task_id uuid,
    p_task_payload jsonb,
    p_repeat_type text,
    p_interval_days integer,
    p_start_date date,
    p_schedule_time time
  ) returns uuid language plpgsql security definer set search_path = public as $$
  declare
    v_uid uuid := auth.uid();
    v_role public.app_role := public.auth_role();
    v_task_id uuid := coalesce(p_task_id, gen_random_uuid());
    v_client_id uuid := nullif(p_task_payload->>'client_id', '')::uuid;
    v_ticket_id uuid := nullif(p_task_payload->>'ticket_id', '')::uuid;
    v_assignee_id uuid := nullif(p_task_payload->>'assignee_id', '')::uuid;
    v_visibility text := coalesce(p_task_payload->>'visibility', 'public');
    v_schedule_id uuid;
  begin
    if v_uid is null or v_role not in ('super_admin', 'manager', 'team_lead', 'employee') then
      raise exception 'Only active staff can schedule tasks';
    end if;
    if nullif(trim(p_task_payload->>'title'), '') is null or v_assignee_id is null then
      raise exception 'A task title and assignee are required';
    end if;
    if p_repeat_type is null or p_repeat_type not in ('daily', 'weekly', 'custom')
       or (p_repeat_type = 'custom' and (p_interval_days is null or p_interval_days < 2 or p_interval_days > 3650))
       or (p_repeat_type <> 'custom' and p_interval_days is not null)
       or p_start_date is null or p_schedule_time is null then
      raise exception 'Choose a valid schedule, start date, and time';
    end if;
    if v_visibility not in ('public', 'private')
       or (v_visibility = 'public' and v_client_id is null)
       or (v_ticket_id is not null and v_client_id is null) then
      raise exception 'Choose valid task visibility and client details';
    end if;
    if v_visibility = 'private'
       and exists (select 1 from public.profiles p where p.id = v_assignee_id and p.role = 'client') then
      raise exception 'Private tasks cannot be assigned to clients';
    end if;
    if exists (select 1 from public.profiles p where p.id = v_assignee_id and p.role = 'client') then
      if v_role not in ('super_admin', 'manager', 'team_lead') or v_ticket_id is null
         or not exists (
           select 1 from public.clients c join public.profiles p on p.id = c.owner_id
           where c.id = v_client_id and c.owner_id = v_assignee_id
             and p.role = 'client' and p.status = 'active'
         ) then
        raise exception 'Only managers, team leads, and super admins can assign ticket tasks to their active client';
      end if;
    elsif not public.can_assign(v_assignee_id) then
      raise exception 'You cannot assign tasks to this person';
    end if;
    if v_ticket_id is not null and not exists (
      select 1 from public.tickets t where t.id = v_ticket_id and t.client_id = v_client_id
        and t.status <> 'closed' and public.can_see_ticket(t.id)
    ) then
      raise exception 'You cannot create tasks for this ticket';
    end if;
    if coalesce((p_task_payload->>'is_urgent')::boolean, false) and v_role = 'employee' then
      raise exception 'Only managers and admins can mark tasks urgent';
    end if;
    if p_start_date < (now() at time zone 'Asia/Kolkata')::date
       or (p_start_date = (now() at time zone 'Asia/Kolkata')::date
           and p_schedule_time < (now() at time zone 'Asia/Kolkata')::time) then
      raise exception 'Choose a future start date and time';
    end if;

    insert into public.task_schedules (
      task_id, created_by, task_payload, repeat_type, interval_days,
      start_date, schedule_time, next_run_at
    ) values (
      v_task_id, v_uid, p_task_payload, p_repeat_type,
      case when p_repeat_type = 'custom' then p_interval_days else null end,
      p_start_date, p_schedule_time,
      (p_start_date + p_schedule_time) at time zone 'Asia/Kolkata'
    ) returning id into v_schedule_id;
    return v_schedule_id;
  end
  $$;

  revoke all on function public.create_task_schedule(uuid, jsonb, text, integer, date, time) from public, anon;
  grant execute on function public.create_task_schedule(uuid, jsonb, text, integer, date, time) to authenticated;
