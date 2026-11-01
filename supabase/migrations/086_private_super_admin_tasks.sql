-- Tasks assigned to a Super Admin are private to that assignee.
-- All other task visibility keeps the existing role rules.
-- Safe to re-run.

create or replace function public.task_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when exists (
        select 1
        from profiles p
        where p.id = p_assignee_id
          and p.role = 'super_admin'
      ) then p_assignee_id = auth.uid()
      else case auth_role()
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
        else false
      end
    end,
    false
  )
$$;
