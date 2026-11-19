-- Ticket deletion follows who created the ticket, not only its current status.
-- Client-created tickets are protected from company deletion until closed.
-- Keep the existing no-linked-task guard so deleting a ticket cannot remove a
-- ticket's work history while work is still attached to it.

create or replace function public.ticket_created_by_client(p_ticket_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.tickets ticket
      left join public.profiles creator on creator.id = ticket.created_by
     where ticket.id = p_ticket_id
       and (
         creator.role = 'client'::public.app_role
         or ticket.created_by = (
           select client.owner_id
             from public.clients client
            where client.id = ticket.client_id
         )
       )
  )
$$;

revoke all on function public.ticket_created_by_client(uuid) from public, anon, authenticated;
grant execute on function public.ticket_created_by_client(uuid) to authenticated;

-- A client may delete its own request in any workflow state. Company-created
-- tickets are never client-deletable. The linked-task guard below still keeps
-- active team work from being orphaned by a ticket deletion.
create or replace function public.client_can_delete_ticket(p_ticket_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role()::text = 'client'
     and exists (
       select 1
         from public.tickets ticket
        where ticket.id = p_ticket_id
          and ticket.client_id = my_client_id()
          and ticket.created_by = auth.uid()
          and ticket_created_by_client(ticket.id)
          and not exists (
            select 1 from public.tasks task where task.ticket_id = ticket.id
          )
     )
$$;

revoke all on function public.client_can_delete_ticket(uuid) from public, anon, authenticated;
grant execute on function public.client_can_delete_ticket(uuid) to authenticated;

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  for delete to authenticated
  using (
    not exists (select 1 from public.tasks task where task.ticket_id = id)
    and (
      (
        auth_role()::text in ('super_admin', 'manager')
        and (
          not public.ticket_created_by_client(id)
          or status = 'closed'::public.ticket_status
        )
      )
      or public.client_can_delete_ticket(id)
    )
  );
