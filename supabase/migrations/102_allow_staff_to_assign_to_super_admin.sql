-- Any staff member can assign tasks to any active staff member in their own
-- reporting hierarchy, including a super admin.
create or replace function public.can_assign(p_assignee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_assignee is null then true
    when auth.uid() is null then true
    when not exists (
      select 1
      from public.profiles
      where id = p_assignee
        and status = 'active'
        and role in ('super_admin', 'admin', 'team_lead', 'employee')
    ) then false
    else exists (
      with recursive ancestors(id, reporting_to) as (
        select id, reporting_to
        from public.profiles
        where id = auth.uid()

        union

        select parent.id, parent.reporting_to
        from public.profiles parent
        join ancestors child on child.reporting_to = parent.id
      ),
      hierarchy(id) as (
        select id from ancestors

        union

        select child.id
        from public.profiles child
        join hierarchy parent on child.reporting_to = parent.id
      )
      select 1
      from hierarchy
      where id = p_assignee
    )
  end
$$;
