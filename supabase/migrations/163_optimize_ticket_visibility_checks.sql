-- Avoid scanning ticket assignment history for roles whose normal ticket
-- visibility already grants access to every ticket. Employee reassignment
-- history remains part of the visibility rule.

create index if not exists ticket_activity_reassignment_actor_idx
  on public.ticket_activity (ticket_id, actor_id)
  where action = 'assignee_changed';

create or replace function public.ticket_reassignment_actor(p_ticket_id uuid, p_actor_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.ticket_activity activity
    where activity.ticket_id = p_ticket_id
      and activity.actor_id = p_actor_id
      and activity.action = 'assignee_changed'
  )
$$;
revoke all on function public.ticket_reassignment_actor(uuid, uuid) from public, anon;
grant execute on function public.ticket_reassignment_actor(uuid, uuid) to authenticated;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    -- These roles' current ticket_visible() rule is global, so skip a lookup
    -- into tickets when this helper is used by activity, task, or storage RLS.
    when auth_role() in ('super_admin', 'manager', 'team_lead') then
      exists (select 1 from public.tickets t where t.id = p_ticket_id)
    else coalesce((
      select case
        when auth_role() = 'employee'
         and (
           t.assignee_id = auth.uid()
           or t.assigned_by = auth.uid()
           or public.ticket_reassignment_actor(t.id, auth.uid())
         ) then true
        else public.ticket_visible(
          t.client_id, t.department_id, t.assignee_id, t.created_by,
          t.is_urgent, t.status
        )
      end
      from public.tickets t
      where t.id = p_ticket_id
    ), false)
  end
$$;

-- Evaluate visibility against the ticket row already being scanned. The old
-- can_see_ticket(id) policy selected that same row again once for every row.
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    public.ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status)
    or (
      auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
      and (
        assignee_id = auth.uid()
        or assigned_by = auth.uid()
        or public.ticket_reassignment_actor(id, auth.uid())
      )
    )
  );

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update to authenticated
  using (
    public.ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status)
    or (
      auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
      and (
        assignee_id = auth.uid()
        or assigned_by = auth.uid()
        or public.ticket_reassignment_actor(id, auth.uid())
      )
    )
  )
  with check (true);
