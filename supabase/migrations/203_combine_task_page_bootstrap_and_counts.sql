-- Collapse the task-page filter lookups into one HTTP/RPC round trip while
-- preserving the caller's existing RLS visibility on every source table.
create or replace function public.staff_task_page_lookups(
  p_include_people boolean default true,
  p_include_assignments boolean default true
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'people', case when p_include_people then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', profile.id,
          'full_name', profile.full_name,
          'email', profile.email,
          'avatar_url', profile.avatar_url,
          'role', profile.role,
          'job_title', profile.job_title,
          'status', profile.status,
          'weekly_capacity_hours', profile.weekly_capacity_hours,
          'created_at', profile.created_at,
          'reporting_to', profile.reporting_to
        )
        order by profile.created_at, profile.id
      )
      from public.profiles profile
    ), '[]'::jsonb) else '[]'::jsonb end,
    'clients', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', client.id,
          'company_name', client.company_name,
          'company_profile_image_path', client.company_profile_image_path,
          'owner_id', client.owner_id
        )
        order by client.company_name, client.id
      )
      from public.clients client
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', department.id,
          'name', department.name,
          'slug', department.slug,
          'sort_order', department.sort_order
        )
        order by department.sort_order, department.id
      )
      from public.departments department
    ), '[]'::jsonb),
    'department_members', case when p_include_assignments then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'department_id', member.department_id,
          'profile_id', member.profile_id,
          'is_lead', member.is_lead
        )
        order by member.department_id, member.profile_id
      )
      from public.department_members member
    ), '[]'::jsonb) else '[]'::jsonb end
  );
$$;

revoke all on function public.staff_task_page_lookups(boolean, boolean) from public, anon;
grant execute on function public.staff_task_page_lookups(boolean, boolean) to authenticated;

-- Return all three Tasks tab counts in one request. The eligible-assignee CTEs
-- mirror taskAssigneeIdsForAssignedScope() so the Assigned-by-me tab keeps the
-- same role/reporting-tree behavior as before.
drop function if exists public.staff_task_scope_counts();

create function public.staff_task_scope_counts()
returns table (
  mine_active_count bigint,
  assigned_by_me_count bigint,
  all_visible_count bigint
)
language sql
stable
set search_path = public
as $$
  with recursive
  visible_people as (
    select profile.id, profile.role, profile.status, profile.reporting_to
    from public.profiles profile
  ),
  active_staff as (
    select person.id, person.role
    from visible_people person
    where person.role <> 'client'
      and person.status = 'active'
  ),
  reporting_descendants(id) as (
    select person.id
    from visible_people person
    where person.reporting_to = auth.uid()

    union

    select child.id
    from visible_people child
    join reporting_descendants parent on child.reporting_to = parent.id
  ),
  reporting_ancestors(id, reporting_to) as (
    select person.id, person.reporting_to
    from visible_people person
    where person.id = auth.uid()

    union

    select parent.id, parent.reporting_to
    from visible_people parent
    join reporting_ancestors child on child.reporting_to = parent.id
  ),
  reporting_hierarchy(id) as (
    select ancestor.id
    from reporting_ancestors ancestor

    union

    select child.id
    from visible_people child
    join reporting_hierarchy parent on child.reporting_to = parent.id
  ),
  assigned_scope_assignees(id) as (
    select person.id
    from visible_people person
    where
      (
        auth_role() = 'super_admin'
        and (
          person.role = 'client'
          or exists (select 1 from active_staff staff where staff.id = person.id)
        )
      )
      or (
        auth_role() = 'team_lead'
        and (
          person.role = 'client'
          or exists (
            select 1
            from active_staff staff
            where staff.id = person.id
              and (
                staff.role = 'super_admin'
                or (staff.role = 'employee' and staff.id in (select id from reporting_descendants))
              )
          )
        )
      )
      or (
        auth_role() = 'manager'
        and (
          person.role = 'client'
          or exists (
            select 1
            from active_staff staff
            where staff.id = person.id
              and (
                staff.role = 'super_admin'
                or staff.id in (select id from reporting_hierarchy)
              )
          )
        )
      )
      or (
        auth_role() not in ('super_admin', 'team_lead', 'manager')
        and exists (
          select 1
          from active_staff staff
          where staff.id = person.id
            and (
              staff.role = 'super_admin'
              or staff.id in (select id from reporting_hierarchy)
            )
        )
      )
  )
  select
    count(*) filter (
      where task.assignee_id = auth.uid()
        and task.status not in ('completed', 'cancelled')
    ),
    count(*) filter (
      where task.assigned_by = auth.uid()
        and task.assignee_id in (select assignee.id from assigned_scope_assignees assignee)
    ),
    count(*)
  from public.tasks task;
$$;

revoke all on function public.staff_task_scope_counts() from public, anon;
grant execute on function public.staff_task_scope_counts() to authenticated;

notify pgrst, 'reload schema';
