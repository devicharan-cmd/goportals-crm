-- Allow employees to mark tasks urgent from the task form and task properties.
-- This migration changes only the urgency permission; all other employee guards remain intact.

begin;

do $guard$
declare
  v_definition text;
  v_updated text;
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

  v_updated := replace(v_definition,
    $snippet$    if new.is_urgent and v_role = 'employee' then
      raise exception 'Only managers and super admins can mark tasks urgent';
    end if;

    $snippet$,
    ''
  );
  v_updated := replace(v_updated,
    $snippet$      if new.is_urgent is distinct from old.is_urgent then
        raise exception 'Only managers and super admins can mark tasks urgent';
      end if;
    $snippet$,
    ''
  );

  if v_updated = v_definition then
    raise exception 'The active guard_task_write definition did not match the expected urgency checks';
  end if;

  execute v_updated;
end
$guard$;

do $schedule$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_task_schedule'
   limit 1;

  if v_definition is null then
    raise exception 'public.create_task_schedule was not found';
  end if;

  v_updated := regexp_replace(
    v_definition,
    E'\\s*if coalesce\\(\\(p_task_payload->>''is_urgent''\\)::boolean, false\\) and v_role = ''employee'' then raise exception ''Only managers and admins can mark tasks urgent''; end if;',
    '',
    'g'
  );

  if v_updated = v_definition then
    raise exception 'The active create_task_schedule definition did not match the expected urgency check';
  end if;

  execute v_updated;
end
$schedule$;

commit;
