-- Preserve staff time-log history when the linked profile is permanently deleted.
alter table public.time_logs
  alter column profile_id drop not null;

alter table public.time_logs
  drop constraint if exists time_logs_profile_id_fkey;

alter table public.time_logs
  add constraint time_logs_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;

-- The API refuses staff deletion until this data-preserving FK is in place.
create or replace function public.staff_deletion_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.time_logs'::regclass
      and conname = 'time_logs_profile_id_fkey'
      and contype = 'f'
      and confdeltype = 'n'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_logs'
      and column_name = 'profile_id'
      and is_nullable = 'YES'
  )
$$;

revoke all on function public.staff_deletion_ready() from public, anon, authenticated;
grant execute on function public.staff_deletion_ready() to service_role;
