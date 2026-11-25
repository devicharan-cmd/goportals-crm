-- Reduce task-page round trips without changing visibility or business rules.
-- This migration is additive and safe to re-run.

create or replace function public.staff_task_page_bootstrap(
  p_include_people boolean default true,
  p_include_assignments boolean default true
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'lookups', public.staff_task_page_lookups(p_include_people, p_include_assignments),
    'counts', coalesce((select to_jsonb(counts) from public.staff_task_scope_counts() counts), '{}'::jsonb)
  );
$$;

create or replace function public.staff_task_assignee_ids()
returns setof uuid
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
    where person.role <> 'client' and person.status = 'active'
  ),
  reporting_descendants(id) as (
    select person.id from visible_people person where person.reporting_to = auth.uid()
    union
    select child.id from visible_people child join reporting_descendants parent on child.reporting_to = parent.id
  ),
  reporting_ancestors(id, reporting_to) as (
    select person.id, person.reporting_to from visible_people person where person.id = auth.uid()
    union
    select parent.id, parent.reporting_to from visible_people parent join reporting_ancestors child on child.reporting_to = parent.id
  ),
  reporting_hierarchy(id) as (
    select ancestor.id from reporting_ancestors ancestor
    union
    select child.id from visible_people child join reporting_hierarchy parent on child.reporting_to = parent.id
  ),
  eligible(id) as (
    select person.id from visible_people person
    where
      (auth_role() = 'super_admin' and (person.role = 'client' or exists (select 1 from active_staff staff where staff.id = person.id)))
      or (auth_role() = 'team_lead' and (person.role = 'client' or exists (
        select 1 from active_staff staff where staff.id = person.id
          and (staff.role = 'super_admin' or (staff.role = 'employee' and staff.id in (select id from reporting_descendants)))
      )))
      or (auth_role() = 'manager' and (person.role = 'client' or exists (
        select 1 from active_staff staff where staff.id = person.id
          and (staff.role = 'super_admin' or staff.id in (select id from reporting_hierarchy))
      )))
      or (auth_role() not in ('super_admin', 'team_lead', 'manager') and exists (
        select 1 from active_staff staff where staff.id = person.id
          and (staff.role = 'super_admin' or staff.id in (select id from reporting_hierarchy))
      ))
  )
  select id from eligible;
$$;

revoke all on function public.staff_task_page_bootstrap(boolean, boolean) from public, anon;
grant execute on function public.staff_task_page_bootstrap(boolean, boolean) to authenticated;
revoke all on function public.staff_task_assignee_ids() from public, anon;
grant execute on function public.staff_task_assignee_ids() to authenticated;

create index if not exists tasks_active_assignee_idx
  on public.tasks (assignee_id)
  where status not in ('completed', 'cancelled');

create index if not exists tasks_assigned_scope_idx
  on public.tasks (assigned_by, assignee_id);

create index if not exists tasks_closed_at_idx
  on public.tasks (closed_at)
  where closed_at is not null;

notify pgrst, 'reload schema';
