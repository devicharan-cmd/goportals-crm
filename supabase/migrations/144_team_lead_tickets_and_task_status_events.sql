-- Team leads see tickets the same way managers and super admins do.
-- Migration 139 limited a team lead to tickets assigned to them, so an
-- unassigned ticket disappeared from their Tickets page.
--
-- Status changes are UPDATE events. Realtime can authorize those events
-- against task_visible() only when the previous row is in the WAL.
-- Replica identity full keeps the other open task board on the saved status.

create or replace function public.ticket_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status public.ticket_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'manager' then true
    when 'team_lead' then true
    when 'employee' then p_assignee_id = auth.uid()
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

alter table public.tasks replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;
