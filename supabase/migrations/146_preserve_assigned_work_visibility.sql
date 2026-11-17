-- Keep staff able to see tasks and tickets they assigned or were assigned,
-- even if a later role or reporting change removes their broader scope.
-- Write permissions continue to follow the current role guards.

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when auth_role() = 'client' then
        t.visibility = 'public'
        and t.client_id = my_client_id()
        and (t.ticket_id is null or can_see_ticket(t.ticket_id))
      when auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
       and (
         t.assignee_id = auth.uid()
         or t.assigned_by = auth.uid()
         or exists (
           select 1
           from public.task_activity activity
           where activity.task_id = t.id
             and activity.actor_id = auth.uid()
             and activity.action = 'assignee_changed'
         )
       ) then true
      else task_visible(
        t.client_id, t.department_id, t.assignee_id, t.created_by,
        t.is_urgent, t.status, t.assigned_by
      )
    end
    from public.tasks t
    where t.id = p_task_id
  ), false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
       and (
         t.assignee_id = auth.uid()
         or t.assigned_by = auth.uid()
         or exists (
           select 1
           from public.ticket_activity activity
           where activity.ticket_id = t.id
             and activity.actor_id = auth.uid()
             and activity.action = 'assignee_changed'
         )
       ) then true
      else public.ticket_visible(
        t.client_id, t.department_id, t.assignee_id, t.created_by,
        t.is_urgent, t.status
      )
    end
    from public.tickets t
    where t.id = p_ticket_id
  ), false)
$$;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    public.can_see_task(id)
    and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.can_see_task(id)
    and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
  )
  with check (
    auth_role() <> 'client' or (ticket_id is not null and visibility = 'public')
  );

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (public.can_see_ticket(id));

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update to authenticated
  using (public.can_see_ticket(id))
  with check (true);
