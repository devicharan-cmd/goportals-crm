-- Enable realtime updates for ticket unread-message badges.
-- Safe to re-run.

do $$
begin
  execute 'grant select on public.ticket_comments, public.ticket_comment_reads to authenticated';

  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication is missing';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_comments'
  ) then
    execute 'alter publication supabase_realtime add table public.ticket_comments';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_comment_reads'
  ) then
    execute 'alter publication supabase_realtime add table public.ticket_comment_reads';
  end if;
end;
$$;
