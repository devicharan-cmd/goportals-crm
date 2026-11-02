-- Allow clients to delete tickets that belong to their own client account.
-- Staff deletion permissions remain unchanged.

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  for delete to authenticated
  using (
    is_super_admin()
    or auth_role() = 'admin'
    or (auth_role() = 'client' and client_id = my_client_id())
  );
