-- Preserve the original CRM schema and its rows before installing v2.
-- This migration only moves objects; it does not drop tables or data.
create schema if not exists legacy;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'activity_logs', 'clients', 'comments', 'notifications',
    'team_members', 'ticket_blockers', 'tickets', 'time_logs'
  ] loop
    if to_regclass(format('public.%I', v_name)) is not null
       and to_regclass(format('legacy.%I', v_name)) is null then
      execute format('alter table public.%I set schema legacy', v_name);
    end if;
  end loop;
end $$;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'lifecycle_stage', 'member_role', 'notification_type', 'platform',
    'service_type', 'ticket_priority', 'ticket_status', 'ticket_type', 'work_role'
  ] loop
    if exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = v_name
    ) and not exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'legacy' and t.typname = v_name
    ) then
      execute format('alter type public.%I set schema legacy', v_name);
    end if;
  end loop;
end $$;
