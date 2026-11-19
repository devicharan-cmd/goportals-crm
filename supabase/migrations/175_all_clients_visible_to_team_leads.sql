-- Managers, team leads, and super admins can view every client.
-- Existing permissions for editing clients are unchanged.
create or replace function public.can_see_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(case
    when auth_role() in ('super_admin', 'manager', 'team_lead') then true
    when auth_role() = 'employee' then
         exists (select 1 from public.client_team ct where ct.client_id = p_client_id and ct.profile_id = auth.uid())
      or exists (select 1 from public.tasks t
                 where t.client_id = p_client_id
                   and (t.assignee_id = auth.uid()
                        or t.created_by = auth.uid()
                        or (t.assigned_by = auth.uid() and public.can_see_task(t.id))
                        or (t.is_urgent and t.status not in ('completed', 'cancelled'))))
    when auth_role() = 'client' then p_client_id = public.my_client_id()
    else false
  end, false)
$$;

-- These are read policies only. Existing write policies remain unchanged.
drop policy if exists client_internal_select on public.client_internal;
create policy client_internal_select on public.client_internal for select to authenticated
  using (auth_role() in ('super_admin', 'manager', 'team_lead'));

drop policy if exists client_services_select on public.client_services;
create policy client_services_select on public.client_services for select to authenticated
  using (auth_role() in ('super_admin', 'manager', 'team_lead') or client_id = public.my_client_id());

drop policy if exists client_team_select on public.client_team;
create policy client_team_select on public.client_team for select to authenticated
  using (auth_role() in ('super_admin', 'manager', 'team_lead') or profile_id = auth.uid());

drop policy if exists ecommerce_accounts_select on public.ecommerce_accounts;
create policy ecommerce_accounts_select on public.ecommerce_accounts for select to authenticated
  using (
    auth_role() in ('super_admin', 'manager', 'team_lead')
    or client_id = public.my_client_id()
    or exists (
      select 1 from public.tickets t
       where t.ecommerce_account_id = ecommerce_accounts.id
         and public.can_see_ticket(t.id)
    )
  );

drop policy if exists agreement_acceptances_select on public.agreement_acceptances;
create policy agreement_acceptances_select on public.agreement_acceptances for select to authenticated
  using (auth_role() in ('super_admin', 'manager', 'team_lead') or profile_id = auth.uid());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (
      auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
      and (role <> 'client' or exists (
        select 1 from public.clients c
         where c.owner_id = profiles.id
           and public.can_see_client(c.id)
      ))
    )
  );
