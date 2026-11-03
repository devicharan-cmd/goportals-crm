-- Reconcile ticket status from linked tasks and expose only the assigned staff
-- names needed by the owning client portal.

do $$
begin
  perform set_config('app.bypass_guard', 'on', true);
  perform set_config('app.suppress_activity', 'on', true);

  with task_rollup as (
    select ticket_id,
           count(*) filter (where status <> 'cancelled') as active_tasks,
           count(*) filter (where status = 'completed') as completed_tasks,
           count(*) filter (where status <> 'cancelled' and assignee_id is null) as unassigned_tasks
      from public.tasks
     where ticket_id is not null
     group by ticket_id
  ),
  targets as (
    select t.id,
           case
             when coalesce(r.active_tasks, 0) = 0 then 'unassigned'::public.ticket_status
             when r.completed_tasks = r.active_tasks then 'closed'::public.ticket_status
             when r.unassigned_tasks = 0 then 'assigned'::public.ticket_status
             else 'unassigned'::public.ticket_status
           end as status
      from public.tickets t
      left join task_rollup r on r.ticket_id = t.id
  )
  update public.tickets t
     set status = targets.status
    from targets
   where t.id = targets.id
     and t.status is distinct from targets.status;
end
$$;

create or replace function public.client_ticket_assignment_summary(p_ticket_id uuid)
returns table (status public.ticket_status, staff_assignee_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth.uid() is null or auth_role() is distinct from 'client' then
    raise exception 'Only clients can view their ticket assignment summary';
  end if;

  select t.client_id
    into v_client_id
    from public.tickets t
   where t.id = p_ticket_id;

  if not found or v_client_id is distinct from my_client_id() then
    raise exception 'Ticket not found or it does not belong to your client account';
  end if;

  return query
  with task_rollup as (
    select count(*) filter (where task.status <> 'cancelled') as active_tasks,
           count(*) filter (where task.status = 'completed') as completed_tasks,
           count(*) filter (where task.status <> 'cancelled' and task.assignee_id is null) as unassigned_tasks
      from public.tasks task
     where task.ticket_id = p_ticket_id
  ),
  task_staff as (
    select distinct case
             when assignee.role = 'client' then task.assigned_by
             else task.assignee_id
           end as staff_id
      from public.tasks task
      left join public.profiles assignee on assignee.id = task.assignee_id
     where task.ticket_id = p_ticket_id
       and task.status <> 'cancelled'
  )
  select case
           when rollup.active_tasks = 0 then 'unassigned'::public.ticket_status
           when rollup.completed_tasks = rollup.active_tasks then 'closed'::public.ticket_status
           when rollup.unassigned_tasks = 0 then 'assigned'::public.ticket_status
           else 'unassigned'::public.ticket_status
         end,
         coalesce(array(
           select staff.staff_id
             from task_staff staff
             join public.profiles profile
               on profile.id = staff.staff_id
              and profile.role <> 'client'
              and profile.status = 'active'
            where staff.staff_id is not null
            order by staff.staff_id
         ), '{}'::uuid[])
    from task_rollup rollup;
end
$$;

revoke all on function public.client_ticket_assignment_summary(uuid) from public, anon, authenticated;
grant execute on function public.client_ticket_assignment_summary(uuid) to authenticated;
