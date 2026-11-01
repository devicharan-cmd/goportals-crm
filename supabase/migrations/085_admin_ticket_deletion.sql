-- Allow admins, as well as super admins, to delete tickets.
-- Safe to re-run.

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  for delete to authenticated
  using (is_super_admin() or auth_role() = 'admin');
