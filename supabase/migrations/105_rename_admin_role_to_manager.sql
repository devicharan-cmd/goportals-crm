-- Use manager as the canonical role name. The old enum contained both
-- manager and admin labels; move the former label aside, rename admin, then
-- migrate any old rows to the canonical manager value. PostgreSQL does not
-- support removing enum labels, so retired_manager remains unused.

do $$
declare
  has_manager boolean;
  has_admin boolean;
begin
  select exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role' and e.enumlabel = 'manager'
  ) into has_manager;
  select exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role' and e.enumlabel = 'admin'
  ) into has_admin;

  if has_manager and has_admin then
    alter type public.app_role rename value 'manager' to 'retired_manager';
    alter type public.app_role rename value 'admin' to 'manager';
  elsif has_admin then
    alter type public.app_role rename value 'admin' to 'manager';
  elsif not has_manager then
    raise exception 'Expected manager or admin value in public.app_role';
  end if;
end
$$;

update public.profiles set role = 'manager' where role::text = 'retired_manager';
update public.invites set role = 'manager' where role::text = 'retired_manager';

-- Recompile routines that compare app_role values so literals bind to the
-- canonical manager label after the enum rename.
do $$
declare
  routine record;
  definition text;
begin
  for routine in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and (p.prosrc like '%''admin''%' or p.prosrc like '%''manager''%')
  loop
    definition := replace(routine.definition, '''admin''', '''manager''');
    execute definition;
  end loop;
end
$$;

-- Policies store enum values by internal OID. Recreate any policy that
-- referenced the old manager enum value so its expression uses manager.
do $$
declare
  policy record;
  role_list text;
  using_expression text;
  check_expression text;
  definition text;
begin
  for policy in
    select *
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        coalesce(qual, '') like '%retired_manager%'
        or coalesce(with_check, '') like '%retired_manager%'
      )
  loop
    select string_agg(format('%I', role_name), ', ' order by role_name)
      into role_list
      from unnest(policy.roles) as role_name;

    using_expression := replace(policy.qual, '''retired_manager''', '''manager''');
    check_expression := replace(policy.with_check, '''retired_manager''', '''manager''');

    execute format('drop policy %I on %I.%I', policy.policyname, policy.schemaname, policy.tablename);
    definition := format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy.policyname,
      policy.schemaname,
      policy.tablename,
      lower(policy.permissive),
      policy.cmd,
      coalesce(role_list, 'public')
    );
    if using_expression is not null then
      definition := definition || format(' using (%s)', using_expression);
    end if;
    if check_expression is not null then
      definition := definition || format(' with check (%s)', check_expression);
    end if;
    execute definition;
  end loop;
end
$$;
