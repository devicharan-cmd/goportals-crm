create or replace function public.set_ticket_status(
  p_ticket_id uuid,
  p_status public.ticket_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prior_bypass text := current_setting('app.bypass_guard', true);
begin
  if auth_role() is distinct from 'super_admin'
     and auth_role() is distinct from 'manager'
     and auth_role() is distinct from 'team_lead' then
    raise exception 'Only managers, team leads, or a Super Admin can change ticket status';
  end if;
  if p_status is null then
    raise exception 'Choose a ticket status';
  end if;
  if p_status::text not in ('unassigned', 'assigned', 'closed') then
    raise exception 'Unsupported ticket status';
  end if;
  perform 1 from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if not can_see_ticket(p_ticket_id) then
    raise exception 'You do not have access to this ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets
     set status = p_status
   where id = p_ticket_id
     and status is distinct from p_status;
  perform set_config('app.bypass_guard', coalesce(v_prior_bypass, ''), true);
end
$$;

revoke execute on function public.set_ticket_status(uuid, public.ticket_status) from anon, public;
grant execute on function public.set_ticket_status(uuid, public.ticket_status) to authenticated;
