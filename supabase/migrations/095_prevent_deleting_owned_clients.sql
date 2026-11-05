-- Prevent client deletion from orphaning an active portal profile/Auth account.
-- The account must be removed first; its FK then clears clients.owner_id.
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated
  using (is_super_admin() and owner_id is null);
