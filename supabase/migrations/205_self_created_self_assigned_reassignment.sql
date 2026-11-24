-- Allow a staff member to reassign a task they created and assigned to themselves.
-- Preserve all current guard logic and assignment-scope checks.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.guard_task_write()'::regprocedure) into v_definition;
  if v_definition is null then
    raise exception 'public.guard_task_write was not found';
  end if;

  v_definition := replace(v_definition,
    'v_client_assignee_allowed boolean := false;',
    'v_client_assignee_allowed boolean := false;
  v_self_created_assigned boolean := false;');
  v_definition := replace(v_definition,
    'if v_role = ''employee'' then',
    'v_self_created_assigned := old.created_by = v_uid and old.assignee_id = v_uid;

  if v_role = ''employee'' then');
  v_definition := replace(v_definition,
    'if new.assignee_id is distinct from old.assignee_id and not v_client_assignee_allowed then',
    'if new.assignee_id is distinct from old.assignee_id and not v_client_assignee_allowed and not v_self_created_assigned then');

  if position('v_self_created_assigned' in v_definition) = 0
     or position('and not v_self_created_assigned then' in v_definition) = 0 then
    raise exception 'guard_task_write definition did not match the expected assignment check';
  end if;
  execute v_definition;
end
$$;
