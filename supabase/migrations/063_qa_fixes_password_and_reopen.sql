-- ============================================================
-- 063: QA pass fixes.
--
--   1. Stop storing GST portal passwords. The shipment category asked the
--      client for their GST portal password and it landed in tickets.details
--      as plain text — readable in the table, in backups and to every staff
--      member who can open the ticket. The field is gone from the form
--      (lib/ticket-categories.ts); this scrubs what was already collected
--      and refuses any future write of that key.
--
--   2. Reopening logged a status change nobody made. reopen_ticket() sends
--      the completed tasks back first, which re-fires the auto-progress
--      trigger (047) and wrote an extra 'in_progress' row into
--      ticket_activity under the *client's* name. A suppression flag now
--      silences that intermediate write; the real transition still logs.
--
--   3. A client must say what is wrong when sending a ticket back —
--      an empty reason left the team with a reopened ticket and no clue.
-- Safe to re-run.
-- ============================================================

-- ─── 1. Scrub and block GST portal passwords ────────────────
update tickets
   set details = details - 'gst_password'
 where details ? 'gst_password';

create or replace function public.strip_ticket_secrets() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Belt and braces: even if an old client build posts it, it never lands.
  if new.details ? 'gst_password' then
    new.details := new.details - 'gst_password';
  end if;
  return new;
end $$;

drop trigger if exists tickets_strip_secrets on tickets;
create trigger tickets_strip_secrets before insert or update on tickets
  for each row execute function public.strip_ticket_secrets();

-- ─── 2. Activity log: allow a transition to be suppressed ───
create or replace function public.log_ticket_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into ticket_activity (ticket_id, actor_id, action, new_value, is_client_visible)
    values (new.id, v_uid, 'created', new.subject, true);
    return null;
  end if;

  -- Set by reopen_ticket() around the task write that bounces the ticket
  -- through 'in_progress' on its way to 'reopened'.
  if current_setting('app.suppress_activity', true) = 'on' then
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value, is_client_visible)
    values (new.id, v_uid, 'status_changed', old.status::text, new.status::text, true);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value, is_client_visible)
    values (new.id, v_uid, 'assignee_changed', old.assignee_id::text, new.assignee_id::text, true);
  end if;
  if new.subject is distinct from old.subject
     or new.description is distinct from old.description
     or new.details is distinct from old.details then
    insert into ticket_activity (ticket_id, actor_id, action, is_client_visible)
    values (new.id, v_uid, 'edited', true);
  end if;
  if new.priority is distinct from old.priority then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'priority_changed', old.priority::text, new.priority::text);
  end if;
  if new.is_urgent is distinct from old.is_urgent then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'urgent_changed', old.is_urgent::text, new.is_urgent::text);
  end if;

  return null;
end $$;

-- ─── 3. reopen_ticket(): quiet intermediate, reason required ─
create or replace function public.reopen_ticket(p_ticket_id uuid, p_feedback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   app_role := auth_role();
  v_uid    uuid := auth.uid();
  v_client uuid;
  v_status ticket_status;
begin
  select client_id, status into v_client, v_status from tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_status <> 'resolved' then
    raise exception 'Only a resolved ticket can be reopened';
  end if;

  if v_role in ('super_admin', 'admin') then
    null; -- allowed
  elsif v_role = 'client' and v_client = my_client_id() then
    if length(trim(coalesce(p_feedback, ''))) = 0 then
      raise exception 'Please tell us what needs to change before sending this back';
    end if;
  else
    raise exception 'Only the client or an admin can reopen a resolved ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);

  -- The task write re-fires the auto-progress trigger (047), which drops the
  -- ticket to 'in_progress' on the way. That is plumbing, not something the
  -- client did, so it is kept out of the activity trail.
  perform set_config('app.suppress_activity', 'on', true);
  update tasks set status = 'changes_requested' where ticket_id = p_ticket_id and status = 'completed';
  perform set_config('app.suppress_activity', 'off', true);

  update tickets set status = 'reopened' where id = p_ticket_id;

  if p_feedback is not null and length(trim(p_feedback)) > 0 then
    insert into ticket_comments (ticket_id, author_id, body, is_internal)
    values (p_ticket_id, v_uid, p_feedback, false);
  end if;
end $$;

revoke execute on function public.reopen_ticket(uuid, text) from anon, public;
grant  execute on function public.reopen_ticket(uuid, text) to authenticated;
