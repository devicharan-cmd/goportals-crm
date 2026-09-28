-- ============================================================
-- 007: Managers / TLs see and manage every task assigned to an employee
--      (for employee stats: what each employee is doing, how much is done).
--   • task_visible(): manager also sees tasks whose assignee is an employee
--   • guard_task_write(): manager may update / reassign those tasks
-- Unchanged: admins' and other managers' own tasks stay outside a manager's scope
-- unless they are in the manager's departments / clients.
-- Safe to re-run.
-- ============================================================

create or replace function public.is_employee(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile_id is not null
     and exists (select 1 from profiles where id = p_profile_id and role = 'employee')
$$;

create or replace function public.task_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid,
  p_created_by uuid, p_is_urgent boolean, p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'manager' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
      or is_employee(p_assignee_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.guard_task_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
begin
  -- Service role / SQL editor: no restrictions.
  if v_uid is null then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  -- ── INSERT ──
  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    if v_role = 'client' then
      new.client_id       := my_client_id();
      new.source          := 'client';
      new.status          := 'open';
      new.is_urgent       := false;
      new.assignee_id     := null;
      new.assigned_by     := null;
      new.assigned_at     := null;
      new.estimated_hours := 3;
      new.actual_hours    := null;
      new.parent_task_id  := null;
      if new.type = 'task' then new.type := 'request'; end if;
      new.department_id   := (select department_id from services where id = new.service_id);
      return new;
    end if;

    new.source := 'internal';
    if new.is_urgent and v_role = 'employee' then
      raise exception 'Only managers and admins can mark tasks urgent';
    end if;
    if new.assignee_id is not null then
      if not can_assign(new.assignee_id) then
        raise exception 'You cannot assign tasks to this person';
      end if;
      new.assigned_by := v_uid;
      new.assigned_at := now();
    end if;
    if new.department_id is null and new.service_id is not null then
      new.department_id := (select department_id from services where id = new.service_id);
    end if;
    return new;
  end if;

  -- ── UPDATE ──
  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status <> 'done'
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'client' then
    if coalesce(old.created_by <> v_uid, true) or old.status <> 'open' then
      raise exception 'You can only edit your own tasks while they are still open';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new),
         array['title', 'description', 'platform_id', 'service_id', 'due_date', 'department_id', 'updated_at']) then
      raise exception 'You can only change the title, description, platform, service and due date';
    end if;
    new.department_id := (select department_id from services where id = new.service_id);
    return new;

  elsif v_role = 'employee' then
    if not v_is_claim then
      if not (coalesce(old.assignee_id = v_uid, false) or coalesce(old.created_by = v_uid, false)) then
        raise exception 'You can only update tasks assigned to you';
      end if;
      if new.is_urgent is distinct from old.is_urgent then
        raise exception 'Only managers and admins can mark tasks urgent';
      end if;
    end if;

  elsif v_role = 'manager' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id)
               or is_employee(old.assignee_id);            -- 007: any employee's task
    if not v_in_scope and not v_is_claim then
      raise exception 'This task is outside your scope — you can only claim it if it is urgent and unassigned';
    end if;
  end if;

  -- Assignment change (all staff roles)
  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tasks to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  return new;
end $$;
