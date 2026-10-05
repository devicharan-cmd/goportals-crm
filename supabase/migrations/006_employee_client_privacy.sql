-- ============================================================
-- 006: Employees can't see client details.
--   • Employees only see a client row when they have a task for that client
--     (assigned / created by them / in the urgent pool) or are on its client_team —
--     just enough to show the client name on their tasks.
--   • Platforms, services and the client team list: super admin + managers only.
--   • Profiles of client logins (email, phone): super admin + managers only;
--     employees see a client contact only for clients they work on.
-- Safe to re-run.
-- ============================================================

create or replace function public.can_see_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'manager'     then true
    when 'employee'    then
         exists (select 1 from client_team ct where ct.client_id = p_client_id and ct.profile_id = auth.uid())
      or exists (select 1 from tasks t
                 where t.client_id = p_client_id
                   and (t.assignee_id = auth.uid()
                        or t.created_by = auth.uid()
                        or (t.is_urgent and t.status <> 'done')))
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

-- clients
drop policy if exists clients_select on clients;
create policy clients_select on clients for select to authenticated
  using (owner_id = auth.uid() or can_see_client(id));

-- platforms / services / team of a client
drop policy if exists client_platforms_select on client_platforms;
create policy client_platforms_select on client_platforms for select to authenticated
  using (is_super_admin() or auth_role() = 'manager' or client_id = my_client_id());

drop policy if exists client_services_select on client_services;
create policy client_services_select on client_services for select to authenticated
  using (is_super_admin() or auth_role() = 'manager' or client_id = my_client_id());

drop policy if exists client_team_select on client_team;
create policy client_team_select on client_team for select to authenticated
  using (is_super_admin() or auth_role() = 'manager' or profile_id = auth.uid());

-- profiles: employees see staff + only the client logins of clients they work on
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (
    id = auth.uid()
    or is_super_admin()
    or coalesce(auth_role() = 'manager', false)
    or (is_staff() and (
          role <> 'client'
          or exists (select 1 from clients c where c.owner_id = profiles.id and can_see_client(c.id))
       ))
  );
