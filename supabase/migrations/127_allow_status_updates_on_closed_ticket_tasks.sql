-- Closed tickets still prevent adding tasks or moving tasks between tickets,
-- but staff may update the status of an existing linked task.
create or replace function public.guard_closed_ticket_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_status public.ticket_status;
  v_check_new_ticket boolean;
begin
  if current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_check_new_ticket := true;
  else
    v_check_new_ticket := new.ticket_id is distinct from old.ticket_id;
  end if;

  if tg_op = 'UPDATE' and old.ticket_id is not null then
    select status into v_ticket_status
      from public.tickets
     where id = old.ticket_id;
    if v_ticket_status = 'closed'
       and new.ticket_id is distinct from old.ticket_id then
      raise exception 'Reopen this ticket before moving its tasks';
    end if;
  end if;

  if new.ticket_id is not null and v_check_new_ticket then
    select status into v_ticket_status
      from public.tickets
     where id = new.ticket_id;
    if v_ticket_status = 'closed' then
      raise exception 'Reopen this ticket before adding tasks';
    end if;
  end if;

  return new;
end
$$;
