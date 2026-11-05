-- Return the people assigned to tasks on a ticket without exposing linked
-- task details that are hidden by the normal task visibility rules.
drop function if exists public.ticket_active_staff(uuid);

create or replace function public.ticket_task_assignees(p_ticket_id uuid)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  role public.app_role
)
language sql stable security definer set search_path = public as $$
  with visible_ticket as (
    select t.id
    from public.tickets t
    where t.id = p_ticket_id
      and auth_role() in ('super_admin', 'admin', 'team_lead')
      and can_see_ticket(t.id)
  ),
  assignee_ids as (
    select distinct task.assignee_id as profile_id
    from public.tasks task
    join visible_ticket ticket on ticket.id = task.ticket_id
    where task.assignee_id is not null
  )
  select profile.id, profile.full_name, profile.avatar_url, profile.role
  from assignee_ids
  join public.profiles profile on profile.id = assignee_ids.profile_id
  order by profile.full_name, profile.id
$$;

revoke all on function public.ticket_task_assignees(uuid) from public, anon;
grant execute on function public.ticket_task_assignees(uuid) to authenticated;
