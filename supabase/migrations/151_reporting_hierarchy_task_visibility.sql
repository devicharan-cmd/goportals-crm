-- Managers and team leads can see tasks assigned to anyone in their
-- reporting hierarchy, regardless of who assigned the task.
create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when auth_role() = 'client' then
        t.visibility = 'public'
        and t.client_id = my_client_id()
        and (t.ticket_id is null or can_see_ticket(t.ticket_id))
      when auth_role() in ('manager', 'team_lead')
       and t.assignee_id is not null
       and exists (
         with recursive reports(id) as (
           select p.id
           from public.profiles p
           where p.reporting_to = auth.uid()
           union
           select child.id
           from public.profiles child
           join reports parent on child.reporting_to = parent.id
         )
         select 1 from reports where id = t.assignee_id
       ) then true
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
