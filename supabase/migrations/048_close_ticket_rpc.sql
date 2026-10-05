-- ============================================================
-- 048: close_ticket() RPC — the only way a 'resolved' ticket becomes
--   'closed' (permanent). Mirrors approve_client()'s pattern: the
--   client who owns the ticket can close their own resolved ticket
--   ("approve & close"), and admin/super_admin can force-close any
--   resolved ticket administratively. team_lead/employee cannot close
--   tickets at all. A dedicated RPC rather than a guard-permitted
--   direct UPDATE because this permission shape (client-owns-and-
--   resolved, OR admin/super_admin unconditionally) doesn't fit
--   guard_ticket_write()'s per-role branch structure cleanly.
-- Safe to re-run.
-- ============================================================

create or replace function public.close_ticket(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   app_role := auth_role();
  v_client uuid;
  v_status ticket_status;
begin
  select client_id, status into v_client, v_status from tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_status <> 'resolved' then
    raise exception 'Only a resolved ticket can be closed';
  end if;

  if v_role in ('super_admin', 'admin') then
    null; -- allowed
  elsif v_role = 'client' and v_client = my_client_id() then
    null; -- allowed — the client closing their own resolved ticket
  else
    raise exception 'Only the client or an admin can close a resolved ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update tickets set status = 'closed' where id = p_ticket_id;
end $$;

revoke execute on function public.close_ticket(uuid) from anon, public;
grant  execute on function public.close_ticket(uuid) to authenticated;
