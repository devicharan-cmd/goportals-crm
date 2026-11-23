-- Rename the task status enum value without changing task rows.
-- Apply this migration in Supabase before deploying the matching application code.
-- Ticket status values are intentionally untouched; ticket_status remains independent.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'task_status'
      and e.enumlabel = 'in_progress'
  ) then
    if exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'task_status'
        and e.enumlabel = 'in_manual_process'
    ) then
      raise notice 'task_status.in_manual_process already exists; nothing to rename';
      return;
    end if;

    raise exception 'task_status.in_progress was not found; inspect the live enum before continuing';
  end if;

  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'task_status'
      and e.enumlabel = 'in_manual_process'
  ) then
    raise exception 'task_status.in_manual_process already exists while in_progress is still present';
  end if;

  alter type public.task_status rename value 'in_progress' to 'in_manual_process';
end
$$;

commit;
