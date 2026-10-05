-- ============================================================
-- 020: Employees can no longer change a task's assignee or due date,
--   even on a task assigned to (or created by) them — only managers
--   and super admins may reassign or reschedule a task. Employees keep
--   every other right they already had (status, description, comments,
--   time logs, etc.). Claiming an unassigned urgent task (claim_task /
--   the v_is_claim path below) is unaffected — it never touches
--   due_date and is excluded from this check by definition.
-- Safe to re-run.
-- ============================================================

create or replace function public.guard_task_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
begin
  if v_uid is null then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if v_role = 'client' then
    raise exception 'Clients cannot create or edit tasks directly — submit a ticket instead';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;
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

  -- UPDATE
  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status <> 'done'
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
    end if;

  elsif v_role = 'manager' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id)
               or is_employee(old.assignee_id);
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
end $$;
