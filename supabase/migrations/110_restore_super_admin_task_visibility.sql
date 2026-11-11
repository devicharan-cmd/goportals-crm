-- Preserve the existing visibility rule for tasks assigned by the current
-- Super Admin. The assigned-by scope applies its own recipient filtering.
create or replace function public.task_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status public.task_status,
  p_assigned_by uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when auth_role() = 'client' then
        p_assignee_id = auth.uid() and p_client_id = my_client_id()
      when p_assigned_by = auth.uid() then
        case auth_role()
          when 'super_admin' then true
          when 'team_lead' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and exists (
              select 1 from public.profiles p
              where p.id = p_assignee_id and p.status = 'active'
                and p.role in ('employee', 'super_admin')
                and (
                  p.role = 'super_admin'
                  or exists (
                    with recursive descendants(id) as (
                      select id from public.profiles where reporting_to = auth.uid()
                      union
                      select p.id from public.profiles p
                      join descendants d on p.reporting_to = d.id
                    )
                    select 1 from descendants where id = p_assignee_id
                  )
                )
            )
          when 'manager' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and (
              can_assign(p_assignee_id) or exists (
                select 1 from public.profiles p
                where p.id = p_assignee_id and p.status = 'active' and p.role = 'super_admin'
              )
            )
          when 'employee' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and (
              can_assign(p_assignee_id) or exists (
                select 1 from public.profiles p
                where p.id = p_assignee_id and p.status = 'active' and p.role = 'super_admin'
              )
            )
          else false
        end
      when exists (
        select 1 from public.profiles p
        where p.id = p_assigned_by and p.role = 'super_admin'
      ) then auth.uid() in (p_assigned_by, p_assignee_id)
      when exists (
        select 1 from public.profiles p
        where p.id = p_assignee_id and p.role = 'super_admin'
      ) then p_assignee_id = auth.uid()
      else case auth_role()
        when 'super_admin' then true
        when 'manager' then p_assignee_id is not null
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
