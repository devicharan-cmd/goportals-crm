-- Evaluate task visibility using the task row already being scanned. The
-- previous task SELECT policy called can_see_task(id), which selected the
-- same task again for every candidate row.
create index if not exists profiles_reporting_to_idx
  on public.profiles (reporting_to)
  where reporting_to is not null;

create or replace function public.can_see_task_row(
  p_task_id uuid,
  p_ticket_id uuid,
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_assigned_by uuid,
  p_is_urgent boolean,
  p_status public.task_status,
  p_visibility text
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case
    when auth_role() = 'client' then
      p_visibility = 'public'
      and p_client_id = my_client_id()
      and (p_ticket_id is null or public.can_see_ticket(p_ticket_id))
    when auth_role() in ('manager', 'team_lead')
     and p_assignee_id is not null
     and exists (
       with recursive reports(id) as (
         select profile.id
         from public.profiles profile
         where profile.reporting_to = auth.uid()
         union
         select child.id
         from public.profiles child
         join reports parent on child.reporting_to = parent.id
       )
       select 1 from reports where id = p_assignee_id
     ) then true
    when auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
     and (
       p_assignee_id = auth.uid()
       or p_assigned_by = auth.uid()
       or exists (
         select 1
         from public.task_activity activity
         where activity.task_id = p_task_id
           and activity.actor_id = auth.uid()
           and activity.action = 'assignee_changed'
       )
     ) then true
    else public.task_visible(
      p_client_id, p_department_id, p_assignee_id, p_created_by,
      p_is_urgent, p_status, p_assigned_by
    )
  end, false)
$$;

revoke all on function public.can_see_task_row(uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean, public.task_status, text)
  from public, anon;
grant execute on function public.can_see_task_row(uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean, public.task_status, text)
  to authenticated;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    public.can_see_task_row(
      id, ticket_id, client_id, department_id, assignee_id, created_by,
      assigned_by, is_urgent, status, visibility
    )
    and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
  );

-- Keep the history RPC's visibility check aligned with the optimized task
-- policy and avoid re-reading each requested task by primary key.
create or replace function public.task_assignee_history(p_task_ids uuid[])
returns table (
  task_id uuid,
  profile_id uuid,
  full_name text,
  avatar_url text,
  role app_role,
  assigned_at timestamptz,
  is_current boolean
)
language sql stable security definer set search_path = public as $$
  with requested as (
    select distinct requested_id
    from unnest(p_task_ids) as requested(requested_id)
  ),
  visible_tasks as (
    select t.id, t.assignee_id, t.assigned_at
    from public.tasks t
    join requested r on r.requested_id = t.id
    where public.can_see_task_row(
      t.id, t.ticket_id, t.client_id, t.department_id, t.assignee_id,
      t.created_by, t.assigned_by, t.is_urgent, t.status, t.visibility
    )
  ),
  assignments as (
    select t.id as task_id, t.assignee_id as profile_id, t.assigned_at, true as is_current
    from visible_tasks t
    where t.assignee_id is not null

    union all

    select
      t.id, public.try_uuid(activity.old_value), activity.created_at, false
    from visible_tasks t
    join public.task_activity activity on activity.task_id = t.id
    where activity.action = 'assignee_changed'
      and public.try_uuid(activity.old_value) is not null
      and public.try_uuid(activity.old_value) is distinct from t.assignee_id
  ),
  ranked_assignments as (
    select a.*,
           row_number() over (
             partition by a.task_id, a.profile_id
             order by a.is_current desc, a.assigned_at desc nulls last
           ) as assignment_rank
    from assignments a
  )
  select a.task_id, a.profile_id,
         coalesce(p.full_name, 'Former assignee'),
         p.avatar_url, p.role, a.assigned_at, a.is_current
  from ranked_assignments a
  left join public.profiles p on p.id = a.profile_id
  where a.assignment_rank = 1
  order by a.task_id, a.is_current desc, a.assigned_at desc nulls last
$$;

revoke all on function public.task_assignee_history(uuid[]) from public, anon;
grant execute on function public.task_assignee_history(uuid[]) to authenticated;
