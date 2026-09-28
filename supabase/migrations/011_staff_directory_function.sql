-- ============================================================
-- 011: Replace the staff_directory VIEW with a function.
-- Supabase's security advisor flags views that run with their creator's rights
-- ("Security Definer View"). The view existed so clients can see the names of
-- the staff on their tasks without reading staff emails, phones or capacity.
-- A function does the same job, returns only those safe columns, and is callable
-- only by signed-in, active users. The app calls it with supabase.rpc('staff_directory').
-- Safe to re-run.
-- ============================================================

drop view if exists public.staff_directory;

create or replace function public.staff_directory()
returns table (id uuid, full_name text, avatar_url text, job_title text, role app_role)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.job_title, p.role
  from profiles p
  where p.role <> 'client'
    and p.status = 'active'
    and auth_role() is not null          -- caller must be a signed-in, active user
$$;

revoke execute on function public.staff_directory() from anon, public;
grant  execute on function public.staff_directory() to authenticated;
