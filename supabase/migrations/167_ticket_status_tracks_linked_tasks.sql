-- Only task linkage controls the ticket assignment bucket:
--   one or more linked tasks -> assigned
--   no linked tasks          -> unassigned
-- Closing remains an explicit action through close_ticket().
-- This migration deliberately does not backfill or rewrite existing tickets.

create or replace function public.sync_ticket_assignment_from_linked_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
  v_ticket_ids uuid[];
  v_status public.ticket_status;
  v_target public.ticket_status;
  v_prior_bypass text := current_setting('app.bypass_guard', true);
begin
  if tg_op = 'INSERT' then
    v_ticket_ids := array[new.ticket_id];
  elsif tg_op = 'DELETE' then
    v_ticket_ids := array[old.ticket_id];
  else
    v_ticket_ids := array[old.ticket_id, new.ticket_id];
  end if;

  foreach v_ticket_id in array v_ticket_ids loop
    if v_ticket_id is null then
      continue;
    end if;

    select ticket.status
      into v_status
      from public.tickets ticket
     where ticket.id = v_ticket_id;

    -- Linked task changes can never close or reopen a ticket.
    if not found or v_status = 'closed'::public.ticket_status then
      continue;
    end if;

    if exists (select 1 from public.tasks task where task.ticket_id = v_ticket_id) then
      v_target := 'assigned'::public.ticket_status;
    else
      v_target := 'unassigned'::public.ticket_status;
    end if;

    if v_status is distinct from v_target then
      perform set_config('app.bypass_guard', 'on', true);
      update public.tickets
         set status = v_target
       where id = v_ticket_id
         and status <> 'closed'::public.ticket_status;
      perform set_config('app.bypass_guard', coalesce(v_prior_bypass, ''), true);
    end if;
  end loop;

  return null;
end
$$;

drop trigger if exists tasks_sync_ticket_assignment on public.tasks;
create trigger tasks_sync_ticket_assignment
after insert or delete or update of ticket_id on public.tasks
for each row execute function public.sync_ticket_assignment_from_linked_tasks();
