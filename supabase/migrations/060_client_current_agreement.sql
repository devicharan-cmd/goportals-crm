-- Let a client read only the currently published agreement during onboarding.
-- The function deliberately exposes no draft or historical agreement rows.
create or replace function public.current_client_agreement()
returns setof public.agreements
language sql
stable
security definer
set search_path = public
as $$
  select a.*
  from public.agreements a
  where a.is_current
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'client'
    )
$$;

revoke all on function public.current_client_agreement() from public, anon;
grant execute on function public.current_client_agreement() to authenticated;
