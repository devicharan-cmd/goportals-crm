-- Migration 087 unintentionally changed ticket visibility while adding
-- Super Admin assignment visibility. Restore the ticket rules from 084/085.
-- Safe to re-run.

drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;

create or replace function public.ticket_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status ticket_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'team_lead' then p_assignee_id = auth.uid()
    when 'employee' then p_assignee_id = auth.uid()
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select ticket_visible(
      t.client_id, t.department_id, t.assignee_id, t.created_by,
      t.is_urgent, t.status
    )
    from tickets t where t.id = p_ticket_id
  ), false)
$$;

drop function if exists public.ticket_visible(uuid, uuid, uuid, uuid, boolean, ticket_status, uuid);

create policy tickets_select on public.tickets for select to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status));
create policy tickets_update on public.tickets for update to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status))
  with check (true);
create policy tickets_delete on public.tickets for delete to authenticated
  using (is_super_admin() or auth_role() = 'admin');
