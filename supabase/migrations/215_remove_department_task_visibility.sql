-- Task visibility follows reporting hierarchy and direct task relationships.
-- A team lead's department membership must not, by itself, expose every task
-- in that department. Keep manager/client coverage and direct access rules.

begin;

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
      when auth_role() = 'super_admin' then true
      when p_assigned_by = auth.uid() then
        case auth_role()
          when 'team_lead' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and exists (
              select 1 from public.profiles p
              where p.id = p_assignee_id and (p.status = 'active' or p.role = 'client')
                and p.role in ('employee', 'super_admin', 'client')
                and (
                  p.role = 'super_admin'
                  or p.role = 'client' and exists (
                    select 1 from public.clients c
                    where c.id = p_client_id and c.owner_id = p_assignee_id
                  )
                  or p.role = 'employee' and exists (
                    with recursive descendants(id) as (
                      select id from public.profiles where reporting_to = auth.uid()
                      union
                      select child.id from public.profiles child
                      join descendants d on child.reporting_to = d.id
                    )
                    select 1 from descendants where id = p_assignee_id
                  )
                )
            )
          when 'manager' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and (
              can_assign(p_assignee_id)
              or exists (
                select 1 from public.profiles p
                where p.id = p_assignee_id and p.status = 'active' and p.role = 'super_admin'
              )
              or exists (
                select 1
                from public.clients c
                join public.profiles p on p.id = c.owner_id
                where c.id = p_client_id and c.owner_id = p_assignee_id
                  and p.role = 'client' and p.status = 'active'
              )
            )
          when 'employee' then
            p_assignee_id = auth.uid()
            or p_assignee_id is not null and (
              can_assign(p_assignee_id)
              or exists (
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
        when 'manager' then p_assignee_id is not null
        when 'team_lead' then
             p_assignee_id is not null
          and (
               p_assignee_id = auth.uid()
            or p_created_by = auth.uid()
            or manager_covers_client(p_client_id)
          )
        when 'employee' then p_assignee_id = auth.uid()
        else false
      end
    end,
    false
  )
$$;

notify pgrst, 'reload schema';

commit;
