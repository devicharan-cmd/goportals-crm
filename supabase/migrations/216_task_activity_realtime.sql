-- Keep task status/assignment timelines live alongside the task rows.
-- Safe to apply repeatedly; the publication may already contain tasks.
do $$
declare
  v_table text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication is missing';
  end if;

  if not exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and puballtables
  ) then
    foreach v_table in array array['task_activity', 'task_schedules', 'task_schedule_attachments', 'task_comments', 'task_attachments', 'ticket_activity'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$$;

-- UPDATE events need the previous row image for reliable status/assignment
-- refreshes, while FULL also keeps activity consumers consistent.
alter table public.tasks replica identity full;
alter table public.task_activity replica identity full;
alter table public.task_schedules replica identity full;
alter table public.task_schedule_attachments replica identity full;
alter table public.task_comments replica identity full;
alter table public.task_attachments replica identity full;
alter table public.ticket_activity replica identity full;

notify pgrst, 'reload schema';
