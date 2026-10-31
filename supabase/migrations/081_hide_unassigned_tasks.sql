-- Non-Super Admin users should not see a task until it has an assignee.
-- Once assigned, preserve each role's existing visibility scope.
-- Super Admins retain full visibility so they can assign newly created tasks.

create or replace function public.task_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then p_assignee_id is not null
    when 'team_lead' then
         p_assignee_id is not null
      and (
           p_assignee_id = auth.uid()
        or p_created_by = auth.uid()
        or (p_department_id is not null and manages_department(p_department_id))
        or manager_covers_client(p_client_id)
      )
    when 'employee' then p_assignee_id = auth.uid()
    else false -- clients do not access internal tasks
  end, false)
$$;
