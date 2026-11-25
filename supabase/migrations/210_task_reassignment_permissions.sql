-- Task reassignment rules:
--   * super admins, managers, and team leads may reassign non-self-assigned tasks
--     to any active staff member (can_assign_task() enforces the target check);
--   * a self-assigned task is owned by its creator/current assignee, and only
--     that person may change its assignee;
--   * employees may reassign only their own self-assigned tasks.
begin;

do $guard$
declare
  v_definition text;
  v_updated text;
  v_before text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'guard_task_write'
   limit 1;

  if v_definition is null then
    raise exception 'public.guard_task_write was not found';
  end if;

  -- Protect self-assigned tasks from every other staff member, including
  -- managers, team leads, and super admins. Earlier migration 205 may already
  -- have changed the employee branch, so anchor this insertion to the stable
  -- employee branch instead of assuming the older v_status_only text exists.
  if position('Only the owner can reassign a self-assigned task' in v_definition) = 0 then
    v_before := v_definition;
    v_updated := replace(v_before,
      $snippet$if v_role = 'employee' then$snippet$,
      $replacement$if new.assignee_id is distinct from old.assignee_id
     and old.assignee_id is not null
     and old.assignee_id = old.created_by
     and old.assigned_by = old.assignee_id
     and old.assignee_id is distinct from v_uid then
    raise exception 'Only the owner can reassign a self-assigned task';
  end if;

  if v_role = 'employee' then$replacement$);
    if v_updated = v_before then
      raise exception 'Could not add self-assigned task protection to guard_task_write';
    end if;
    v_definition := v_updated;
  end if;

  -- Employees may change the assignee only when they own a self-assigned task.
  if position('and not v_self_created_assigned then' in v_definition) = 0 then
    v_before := v_definition;
    v_updated := replace(v_before,
      $snippet$      if new.assignee_id is distinct from old.assignee_id and not v_client_assignee_allowed then
        raise exception 'Only managers and super admins can change the assignee';
      end if;$snippet$,
      $replacement$      if new.assignee_id is distinct from old.assignee_id
         and not v_client_assignee_allowed
         and not (old.assignee_id = old.created_by
                  and old.assigned_by = old.assignee_id
                  and old.assignee_id = v_uid) then
        raise exception 'Only the self-assigned task owner or a manager can change the assignee';
      end if;$replacement$);
    if v_updated = v_before then
      raise exception 'Could not update employee reassignment permission in guard_task_write';
    end if;
    v_definition := v_updated;
  end if;

  -- Team leads may reassign non-self-assigned tasks outside their hierarchy;
  -- they still cannot override the self-assigned owner protection above.
  v_before := v_definition;
  v_updated := replace(v_before,
    $snippet$if not v_in_scope and not v_is_claim then
      raise exception 'This task is outside your scope — you can only claim it if it is urgent and unassigned';
    end if;$snippet$,
    $replacement$if not v_in_scope
       and not v_is_claim
       and not (v_role = 'team_lead'
                and new.assignee_id is distinct from old.assignee_id
                and not (old.assignee_id is not null
                         and old.assignee_id = old.created_by
                         and old.assigned_by = old.assignee_id)) then
      raise exception 'This task is outside your scope — you can only claim it if it is urgent and unassigned';
    end if;$replacement$);

  if v_updated = v_before
     and position('v_role = ''team_lead''' in v_definition) > 0
     and position('not (v_role = ''team_lead''' in v_definition) = 0 then
    raise exception 'Could not update team lead reassignment scope in guard_task_write';
  end if;

  execute v_updated;
end
$guard$;

commit;
