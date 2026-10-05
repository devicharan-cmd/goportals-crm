-- ============================================================
-- 045: set_closed_at() was one function, literal-coupled to 'done'
--   twice, shared verbatim by both tasks and tickets. Now that they
--   have separate status vocabularies with different terminal values,
--   split it into set_task_closed_at() ('completed' only — a
--   cancelled task was never "done", so it does NOT stamp closed_at)
--   and set_ticket_closed_at() ('closed' only — 'resolved' is a
--   staging state pending client/admin approval, not "fully done").
-- Safe to re-run.
-- ============================================================

create or replace function public.set_task_closed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    new.closed_at := now();
  elsif new.status <> 'completed' then
    new.closed_at := null;
  end if;
  return new;
end $$;

create or replace function public.set_ticket_closed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then
    new.closed_at := now();
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_b_closed_at on tasks;
create trigger tasks_b_closed_at before insert or update on tasks
  for each row execute function set_task_closed_at();

drop trigger if exists tickets_b_closed_at on tickets;
create trigger tickets_b_closed_at before insert or update on tickets
  for each row execute function set_ticket_closed_at();

-- The old shared function is no longer attached to anything — drop it.
drop function if exists public.set_closed_at();
