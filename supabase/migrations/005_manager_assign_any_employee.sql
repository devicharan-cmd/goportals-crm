-- ============================================================
-- 005: Managers / TLs can assign tasks to ANY active employee, or to themselves.
-- (Before: only to people in the manager's own departments.)
-- super_admin → any active staff · manager → self or any employee · employee → self only
-- Safe to re-run.
-- ============================================================

create or replace function public.can_assign(p_assignee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_assignee is null then true
    when not exists (select 1 from profiles
                     where id = p_assignee and status = 'active'
                       and role in ('super_admin', 'manager', 'employee')) then false
    when auth.uid() is null then true
    when auth_role() = 'super_admin' then true
    when p_assignee = auth.uid() then true
    when auth_role() = 'manager' then exists (
      select 1 from profiles where id = p_assignee and role = 'employee' and status = 'active')
    else false
  end
$$;
