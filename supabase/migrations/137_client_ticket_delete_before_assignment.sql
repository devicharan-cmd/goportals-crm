-- Clients may delete their own tickets only before linked tasks are created.
-- Staff deletion permissions remain unchanged.

create or replace function public.client_can_delete_ticket(p_ticket_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'client'
     and exists (
       select 1
         from public.tickets ticket
        where ticket.id = p_ticket_id
          and ticket.client_id = my_client_id()
          and ticket.created_by = auth.uid()
          and ticket.status = 'new'::public.ticket_status
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
    is_super_admin()
    or auth_role() = 'admin'::app_role
    or public.client_can_delete_ticket(id)
  );
