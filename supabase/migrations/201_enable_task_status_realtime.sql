-- Ensure task status/assignment updates reach every open task board and list.
-- Safe to apply on databases where an earlier task-realtime migration already ran.
do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication is missing';
  end if;

  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
      and puballtables
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;

alter table public.tasks replica identity full;
