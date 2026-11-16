-- Allow ticket-linked tasks to be private. Existing client RLS and portal RPCs
-- continue to return only tasks whose visibility is public.
alter table public.tasks
  drop constraint if exists tasks_ticket_visibility_check;

create or replace function public.guard_private_task_assignee()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visibility = 'private' and new.assignee_id is not null
     and exists (
       select 1 from public.profiles p
       where p.id = new.assignee_id and p.role = 'client'
     ) then
    raise exception 'Private tasks cannot be assigned to clients';
  end if;
  return new;
end
$$;

drop trigger if exists guard_private_task_assignee on public.tasks;
create trigger guard_private_task_assignee
  before insert or update on public.tasks
  for each row execute function public.guard_private_task_assignee();

create or replace function public.create_task_schedule(
  p_task_id uuid,
  p_task_payload jsonb,
  p_repeat_type text,
  p_interval_days integer,
  p_start_date date,
  p_schedule_time time
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.auth_role();
  v_task_id uuid := coalesce(p_task_id, gen_random_uuid());
  v_client_id uuid := nullif(p_task_payload->>'client_id', '')::uuid;
  v_ticket_id uuid := nullif(p_task_payload->>'ticket_id', '')::uuid;
  v_assignee_id uuid := nullif(p_task_payload->>'assignee_id', '')::uuid;
  v_visibility text := coalesce(p_task_payload->>'visibility', 'public');
  v_schedule_id uuid;
begin
  if v_uid is null or v_role not in ('super_admin', 'manager', 'team_lead', 'employee') then
    raise exception 'Only active staff can schedule tasks';
  end if;
  if nullif(trim(p_task_payload->>'title'), '') is null or v_assignee_id is null then
    raise exception 'A task title and assignee are required';
  end if;
  if p_repeat_type is null or p_repeat_type not in ('daily', 'weekly', 'custom')
     or (p_repeat_type = 'custom' and (p_interval_days is null or p_interval_days < 2 or p_interval_days > 3650))
     or (p_repeat_type <> 'custom' and p_interval_days is not null)
     or p_start_date is null or p_schedule_time is null then
    raise exception 'Choose a valid schedule, start date, and time';
  end if;
  if v_visibility not in ('public', 'private')
     or (v_visibility = 'public' and v_client_id is null)
     or (v_ticket_id is not null and v_client_id is null) then
    raise exception 'Choose valid task visibility and client details';
  end if;
  if v_visibility = 'private'
     and exists (select 1 from public.profiles p where p.id = v_assignee_id and p.role = 'client') then
    raise exception 'Private tasks cannot be assigned to clients';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_assignee_id and p.role = 'client') then
    if v_role not in ('super_admin', 'manager', 'team_lead') or v_ticket_id is null
       or not exists (
         select 1 from public.clients c join public.profiles p on p.id = c.owner_id
         where c.id = v_client_id and c.owner_id = v_assignee_id
           and p.role = 'client' and p.status = 'active'
       ) then
      raise exception 'Only managers and team leads can assign ticket tasks to its client';
    end if;
  elsif not public.can_assign(v_assignee_id) then
    raise exception 'You cannot assign tasks to this person';
  end if;
  if v_ticket_id is not null and not exists (
    select 1 from public.tickets t where t.id = v_ticket_id and t.client_id = v_client_id
      and t.status <> 'closed' and public.can_see_ticket(t.id)
  ) then
    raise exception 'You cannot create tasks for this ticket';
  end if;
  if coalesce((p_task_payload->>'is_urgent')::boolean, false) and v_role = 'employee' then
    raise exception 'Only managers and admins can mark tasks urgent';
  end if;
  if p_start_date < (now() at time zone 'Asia/Kolkata')::date
     or (p_start_date = (now() at time zone 'Asia/Kolkata')::date
         and p_schedule_time < (now() at time zone 'Asia/Kolkata')::time) then
    raise exception 'Choose a future start date and time';
  end if;

  insert into public.task_schedules (
    task_id, created_by, task_payload, repeat_type, interval_days,
    start_date, schedule_time, next_run_at
  ) values (
    v_task_id, v_uid, p_task_payload, p_repeat_type,
    case when p_repeat_type = 'custom' then p_interval_days else null end,
    p_start_date, p_schedule_time,
    (p_start_date + p_schedule_time) at time zone 'Asia/Kolkata'
  ) returning id into v_schedule_id;
  return v_schedule_id;
end
$$;

revoke all on function public.create_task_schedule(uuid, jsonb, text, integer, date, time) from public, anon;
grant execute on function public.create_task_schedule(uuid, jsonb, text, integer, date, time) to authenticated;
