-- Restrict Employees to tickets assigned to them, and reject ticket creation
-- by Employees at both the RLS and trigger layers. Employee task permissions
-- are intentionally unchanged.

create or replace function public.ticket_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status ticket_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'team_lead' then
         p_assignee_id = auth.uid()
      or p_created_by = auth.uid()
      or (p_is_urgent and p_status <> 'closed')
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
    when 'employee' then p_assignee_id = auth.uid()
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (
    auth_role() in ('super_admin', 'admin', 'team_lead')
    or (auth_role() = 'client' and client_id = my_client_id())
  );

create or replace function public.reject_employee_ticket_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth_role() = 'employee' then
    raise exception using
      errcode = '42501',
      message = 'Employees cannot create tickets';
  end if;
  return new;
end
$$;

drop trigger if exists tickets_0_employee_insert_guard on public.tickets;
create trigger tickets_0_employee_insert_guard
  before insert on public.tickets
  for each row execute function public.reject_employee_ticket_insert();
