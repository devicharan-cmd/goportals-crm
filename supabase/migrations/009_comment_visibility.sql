-- ============================================================
-- 009: Who decides if a comment is public (visible to the client)?
--   • Client            → always public
--   • Employee          → always team-only (is_internal = true)
--   • Manager / Admin   → choose public or team-only per comment
-- Safe to re-run.
-- ============================================================

create or replace function public.guard_comment_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
  end if;

  select role into v_role from profiles where id = auth.uid();
  if v_role = 'client' then
    new.is_internal := false;
  elsif v_role = 'employee' then
    new.is_internal := true;
  end if;
  return new;
end $$;
