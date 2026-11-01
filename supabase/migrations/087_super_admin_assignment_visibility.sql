-- Work explicitly assigned by a Super Admin is visible only to that
-- Super Admin and the assigned person. A task/ticket assigned to a Super
-- Admin remains visible only to that assignee unless another Super Admin
-- explicitly assigned it, in which case both can see it.
-- All other visibility rules remain unchanged.
-- Safe to re-run.

create or replace function public.task_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status task_status,
  p_assigned_by uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when exists (
        select 1 from profiles p
        where p.id = p_assigned_by and p.role = 'super_admin'
      ) then auth.uid() in (p_assigned_by, p_assignee_id)
      when exists (
        select 1 from profiles p
        where p.id = p_assignee_id and p.role = 'super_admin'
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

create or replace function public.ticket_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status ticket_status,
  p_assigned_by uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when auth_role() = 'client' then p_client_id = my_client_id()
      when exists (
        select 1 from profiles p
        where p.id = p_assigned_by and p.role = 'super_admin'
      ) then auth.uid() in (p_assigned_by, p_assignee_id)
      when exists (
        select 1 from profiles p
        where p.id = p_assignee_id and p.role = 'super_admin'
      ) then p_assignee_id = auth.uid()
      else case auth_role()
        when 'super_admin' then true
        when 'admin' then true
        when 'team_lead' then p_assignee_id = auth.uid()
        when 'employee' then p_assignee_id = auth.uid()
        else false
      end
    end,
    false
  )
$$;

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select task_visible(
      t.client_id, t.department_id, t.assignee_id, t.created_by,
      t.is_urgent, t.status, t.assigned_by
    )
    from tasks t where t.id = p_task_id
  ), false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select ticket_visible(
      t.client_id, t.department_id, t.assignee_id, t.created_by,
      t.is_urgent, t.status, t.assigned_by
    )
    from tickets t where t.id = p_ticket_id
  ), false)
$$;

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;

drop function if exists public.task_visible(uuid, uuid, uuid, uuid, boolean, task_status);
drop function if exists public.ticket_visible(uuid, uuid, uuid, uuid, boolean, ticket_status);

create policy tasks_select on public.tasks for select to authenticated
  using (task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by));
create policy tasks_update on public.tasks for update to authenticated
  using (task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by))
  with check (true);
create policy tasks_delete on public.tasks for delete to authenticated
  using (is_super_admin() and can_see_task(id));

create policy tickets_select on public.tickets for select to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by));
create policy tickets_update on public.tickets for update to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by))
  with check (true);
create policy tickets_delete on public.tickets for delete to authenticated
  using ((is_super_admin() or auth_role() = 'admin') and can_see_ticket(id));
