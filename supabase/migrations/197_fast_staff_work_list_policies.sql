-- Keep the existing visibility rules exactly intact while giving the two
-- company-wide roles a simple, index-friendly RLS branch.  Those roles were
-- already allowed to see these rows through ticket_visible()/task_visible(),
-- but evaluating those helpers for every row made empty list and count
-- requests unnecessarily slow.

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    auth_role() in ('super_admin', 'manager')
    or public.ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status)
    or (
      auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
      and (
        assignee_id = auth.uid()
        or assigned_by = auth.uid()
        or public.ticket_reassignment_actor(id, auth.uid())
      )
    )
  );

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    auth_role() = 'super_admin'
    or (
      public.can_see_task_row(
        id, ticket_id, client_id, department_id, assignee_id, created_by,
        assigned_by, is_urgent, status, visibility
      )
      and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
    )
  );

-- The Tickets tabs ask for three totals.  For Super Admins and Managers the
-- policy above is company-wide, so count directly against the indexed status
-- column instead of making Postgres evaluate row-level visibility first.  The
-- fallback is intentionally the same predicate as tickets_select.
create or replace function public.staff_ticket_status_counts()
returns table (unassigned_count bigint, assigned_count bigint, closed_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where ticket.status = 'unassigned'),
    count(*) filter (where ticket.status = 'assigned'),
    count(*) filter (where ticket.status = 'closed')
  from public.tickets ticket
  where
    auth_role() in ('super_admin', 'manager')
    or public.ticket_visible(
      ticket.client_id, ticket.department_id, ticket.assignee_id,
      ticket.created_by, ticket.is_urgent, ticket.status
    )
    or (
      auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
      and (
        ticket.assignee_id = auth.uid()
        or ticket.assigned_by = auth.uid()
        or public.ticket_reassignment_actor(ticket.id, auth.uid())
      )
    );
$$;

revoke all on function public.staff_ticket_status_counts() from public, anon;
grant execute on function public.staff_ticket_status_counts() to authenticated;

notify pgrst, 'reload schema';
