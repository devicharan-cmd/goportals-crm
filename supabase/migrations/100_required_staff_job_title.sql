-- Job title is required for every staff profile.
update public.profiles
set job_title = case role::text
  when 'super_admin' then 'Super Admin'
  when 'admin' then 'Manager'
  when 'team_lead' then 'Team Lead'
  when 'employee' then 'Employee'
  else job_title
end
where role in ('super_admin', 'admin', 'team_lead', 'employee')
  and coalesce(btrim(job_title), '') = '';

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from 'client'::app_role
     and coalesce(btrim(new.job_title), '') = '' then
    raise exception 'Job title is required.';
  end if;

  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin() then
    return new;
  end if;

  if not only_changed(to_jsonb(old), to_jsonb(new),
                      array['full_name', 'phone', 'timezone', 'avatar_url', 'updated_at']) then
    raise exception 'Only a super admin can change role, status, email, capacity or timezone';
  end if;
  return new;
end $$;
