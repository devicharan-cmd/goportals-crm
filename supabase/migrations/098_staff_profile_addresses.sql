create table if not exists public.staff_profile_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  current_address text,
  permanent_address text
);

alter table public.staff_profile_details enable row level security;
grant select, insert, update on public.staff_profile_details to authenticated;

drop policy if exists staff_profile_details_select on public.staff_profile_details;
create policy staff_profile_details_select on public.staff_profile_details
  for select to authenticated
  using ((profile_id = auth.uid() and auth_role() <> 'client') or is_super_admin());

drop policy if exists staff_profile_details_insert on public.staff_profile_details;
create policy staff_profile_details_insert on public.staff_profile_details
  for insert to authenticated
  with check (
    is_super_admin()
    or (profile_id = auth.uid() and auth_role() <> 'client')
  );

drop policy if exists staff_profile_details_update on public.staff_profile_details;
create policy staff_profile_details_update on public.staff_profile_details
  for update to authenticated
  using ((profile_id = auth.uid() and auth_role() <> 'client') or is_super_admin())
  with check ((profile_id = auth.uid() and auth_role() <> 'client') or is_super_admin());

create or replace function public.guard_staff_profile_details() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.profile_id and role <> 'client'
  ) then
    raise exception 'Personal address details are only available for staff profiles';
  end if;
  return new;
end $$;

drop trigger if exists staff_profile_details_role_guard on public.staff_profile_details;
create trigger staff_profile_details_role_guard
  before insert or update on public.staff_profile_details
  for each row execute function public.guard_staff_profile_details();

create or replace function public.prevent_client_profile_details_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'client' and exists (
    select 1 from public.staff_profile_details where profile_id = new.id
  ) then
    raise exception 'Remove staff-only personal details before converting this profile to a client';
  end if;
  return new;
end $$;

drop trigger if exists profiles_staff_details_role_guard on public.profiles;
create trigger profiles_staff_details_role_guard
  before update of role on public.profiles
  for each row execute function public.prevent_client_profile_details_role();
