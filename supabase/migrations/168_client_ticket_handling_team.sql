-- Expose contact details only for the staff explicitly assigned to the
-- authenticated client's handling team. This is intentionally ticket-scoped
-- and does not broaden staff_directory(), which remains name/avatar only.
create or replace function public.client_ticket_handling_team(p_ticket_id uuid)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  role public.app_role,
  email text,
  phone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  if auth.uid() is null or auth_role()::text <> 'client' then
    raise exception 'Only clients can view ticket handling contacts';
  end if;

  select t.client_id
    into v_client_id
    from public.tickets t
   where t.id = p_ticket_id;

  if v_client_id is null or v_client_id is distinct from my_client_id() then
    raise exception 'Ticket not found';
  end if;

  return query
  select distinct on (p.id)
         p.id,
         p.full_name,
         p.avatar_url,
         p.role,
         p.email,
         p.phone
    from public.client_team ct
    join public.profiles p on p.id = ct.profile_id
   where ct.client_id = v_client_id
     and p.role <> 'client'
     and p.status = 'active'
   order by p.id, p.full_name;
end;
$$;

revoke all on function public.client_ticket_handling_team(uuid) from public, anon;
grant execute on function public.client_ticket_handling_team(uuid) to authenticated;
