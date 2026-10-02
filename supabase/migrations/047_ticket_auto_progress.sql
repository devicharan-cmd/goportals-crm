-- ============================================================
-- 047: Auto-derive a ticket's status from its linked tasks.
--   Whenever a task linked via tasks.ticket_id changes status (insert,
--   status update, or delete), recompute the parent ticket:
--     - ticket already 'closed'            -> never touched (permanent)
--     - no non-cancelled linked tasks       -> leave ticket alone
--     - all non-cancelled tasks completed   -> ticket -> 'resolved'
--       (never further to 'closed' — that's an explicit human action,
--       see close_ticket() in 048)
--     - otherwise (something still active)  -> ticket -> 'in_progress'
--       (this lets a 'resolved' ticket regress back to 'in_progress'
--       if a task's status moves backward later — e.g. the client
--       asked for more changes after resolution — the intended
--       rework loop; it still never touches a 'closed' ticket)
--
--   Updates tickets via set_config('app.bypass_guard','on',true) before
--   the UPDATE, same pattern accept_agreement() already uses — needed
--   because this UPDATE re-fires guard_ticket_write() in the *acting
--   user's* auth context (not a service role), and an employee
--   completing their own task could easily be outside that ticket's
--   normal write scope. The function checks status='closed' itself
--   and returns early rather than relying on guard_ticket_write()'s
--   permanent-closed check to reject it mid-cascade.
-- Safe to re-run (trigger/function definitions only).
-- ============================================================

create or replace function public.sync_ticket_progress_from_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id     uuid;
  v_ticket_status ticket_status;
  v_total         integer;
  v_done          integer;
  v_target        ticket_status;
begin
  v_ticket_id := case when tg_op = 'DELETE' then old.ticket_id else new.ticket_id end;
  if v_ticket_id is null then
    return null;
  end if;

  select status into v_ticket_status from tickets where id = v_ticket_id;
  if not found or v_ticket_status = 'closed' then
    return null;
  end if;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'completed')
    into v_total, v_done
    from tasks where ticket_id = v_ticket_id;

  if v_total = 0 then
    return null;
  elsif v_done = v_total then
    v_target := 'resolved';
  else
    v_target := 'in_progress';
  end if;

  if v_target <> v_ticket_status then
    perform set_config('app.bypass_guard', 'on', true);
    update tickets set status = v_target where id = v_ticket_id;
  end if;

  return null;
end $$;

drop trigger if exists tasks_d_sync_ticket_progress on tasks;
create trigger tasks_d_sync_ticket_progress after insert or update of status or delete on tasks
  for each row execute function sync_ticket_progress_from_tasks();
