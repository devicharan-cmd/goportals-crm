-- ============================================================
-- 043: RLS policy updates for the new 5-role model (follows 041/042).
--   Straight 'manager' → 'admin' swaps (global, company-wide — these
--   policies never granted team_lead anything, so team_lead must not
--   pick up this blanket visibility just because is_staff() now includes
--   it). Plus new 'admin' clauses on the policies that used to read
--   "is_super_admin() or manager_covers_client(...)" / "... or
--   manages_department(...)" — those department-scoped functions now
--   serve team_lead (per 042), so admin needs its own explicit grant to
--   keep its global reach on clients/departments/invites.
-- Safe to re-run.
-- ============================================================

-- ─── Straight manager → admin swaps (global visibility) ─────
-- (client_platforms was renamed to ecommerce_accounts by migration 013 — its
-- select/write policies are handled by the ecommerce_accounts_* blocks below,
-- not here; there is no client_platforms table left to apply a policy to.)
drop policy if exists client_services_select on client_services;
create policy client_services_select on client_services for select to authenticated
  using (is_super_admin() or auth_role() = 'admin' or client_id = my_client_id());

drop policy if exists client_team_select on client_team;
create policy client_team_select on client_team for select to authenticated
  using (is_super_admin() or auth_role() = 'admin' or profile_id = auth.uid());

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (
    id = auth.uid()
    or is_super_admin()
    or coalesce(auth_role() = 'admin', false)
    or (is_staff() and (
          role <> 'client'
          or exists (select 1 from clients c where c.owner_id = profiles.id and can_see_client(c.id))
       ))
  );

drop policy if exists ecommerce_accounts_select on ecommerce_accounts;
create policy ecommerce_accounts_select on ecommerce_accounts for select to authenticated
  using (
    is_super_admin() or auth_role() = 'admin' or client_id = my_client_id()
    or exists (select 1 from tickets t where t.ecommerce_account_id = ecommerce_accounts.id and can_see_ticket(t.id))
  );

-- ─── Admin gains global client/department management ────────
drop policy if exists clients_insert on clients;
create policy clients_insert on clients for insert to authenticated
  with check (is_super_admin() or auth_role() = 'admin');

drop policy if exists clients_update on clients;
create policy clients_update on clients for update to authenticated
  using (is_super_admin() or auth_role() = 'admin' or manager_covers_client(id) or (auth_role() = 'client' and owner_id = auth.uid()))
  with check (true);  -- column-level enforcement in guard_client_update

drop policy if exists client_internal_select on client_internal;
create policy client_internal_select on client_internal for select to authenticated
  using (is_super_admin() or auth_role() = 'admin' or manager_covers_client(client_id));

drop policy if exists client_internal_update on client_internal;
create policy client_internal_update on client_internal for update to authenticated
  using (is_super_admin() or auth_role() = 'admin' or manager_covers_client(client_id));

drop policy if exists client_services_write on client_services;
create policy client_services_write on client_services for all to authenticated
  using (is_super_admin() or auth_role() = 'admin' or manager_covers_client(client_id))
  with check (is_super_admin() or auth_role() = 'admin' or manager_covers_client(client_id));

drop policy if exists client_team_write on client_team;
create policy client_team_write on client_team for all to authenticated
  using (is_super_admin() or auth_role() = 'admin' or manages_department(department_id))
  with check (is_super_admin() or auth_role() = 'admin' or manages_department(department_id));

drop policy if exists ecommerce_accounts_write on ecommerce_accounts;
create policy ecommerce_accounts_write on ecommerce_accounts for all to authenticated
  using (is_super_admin() or auth_role() = 'admin' or manager_covers_client(client_id))
  with check (is_super_admin() or auth_role() = 'admin' or manager_covers_client(client_id));

drop policy if exists department_members_admin on department_members;
create policy department_members_admin on department_members for all to authenticated
  using (is_super_admin() or auth_role() = 'admin') with check (is_super_admin() or auth_role() = 'admin');

-- ─── Admin can view (but not create/edit/delete) invites, so the
--   "Pending invites" panel on /admin/users works for an admin actor.
--   Actual writes still go through the service-role invite API route;
--   this only governs the regular authenticated-client read. ───────
drop policy if exists invites_admin on invites;
create policy invites_admin on invites for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy invites_select_admin on invites for select to authenticated
  using (auth_role() = 'admin');

-- ─── Explicitly unchanged (still super_admin-only): departments_admin,
--   platforms_admin, services_admin, clients_delete, tasks_delete,
--   ticket*/task*_delete policies, agreements_admin, agreements_select,
--   agreement_acceptances_select, profiles_update, profiles_delete.
