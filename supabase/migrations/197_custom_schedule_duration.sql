-- Custom schedules represent a total number of daily runs, not a repeat interval.
-- Example: custom = 3 creates occurrences on three consecutive scheduled days,
-- then disables the schedule automatically.

create or replace function public.create_task_schedule(
  p_task_id uuid, p_task_payload jsonb, p_repeat_type text, p_interval_days integer,
  p_start_date date, p_schedule_time time
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
  if v_uid is null or v_role not in ('super_admin', 'manager', 'team_lead', 'employee') then raise exception 'Only active staff can schedule tasks'; end if;
  if nullif(trim(p_task_payload->>'title'), '') is null or v_assignee_id is null then raise exception 'A task title and assignee are required'; end if;
  if p_repeat_type is null or p_repeat_type not in ('daily', 'weekly', 'custom')
     or (p_repeat_type = 'custom' and (p_interval_days is null or p_interval_days < 1 or p_interval_days > 3650))
     or (p_repeat_type <> 'custom' and p_interval_days is not null)
     or p_start_date is null or p_schedule_time is null then raise exception 'Choose a valid schedule, duration, start date, and time'; end if;
  if v_visibility not in ('public', 'private') or (v_visibility = 'public' and v_client_id is null)
     or (v_ticket_id is not null and v_client_id is null) then raise exception 'Choose valid task visibility and client details'; end if;
  if exists (select 1 from public.profiles p where p.id = v_assignee_id and p.role = 'client') then
    if v_visibility <> 'public' or not public.can_assign_ticket_client_task(v_ticket_id, v_client_id, v_assignee_id) then raise exception 'Only staff who can access this ticket can assign its active client to a public task'; end if;
  elsif not public.can_assign(v_assignee_id) then raise exception 'You cannot assign tasks to this person'; end if;
  if v_ticket_id is not null and not exists (select 1 from public.tickets t where t.id = v_ticket_id and t.client_id = v_client_id and t.status <> 'closed' and public.can_see_ticket(t.id)) then raise exception 'You cannot create tasks for this ticket'; end if;
  if coalesce((p_task_payload->>'is_urgent')::boolean, false) and v_role = 'employee' then raise exception 'Only managers and admins can mark tasks urgent'; end if;
  if p_start_date < (now() at time zone 'Asia/Kolkata')::date or (p_start_date = (now() at time zone 'Asia/Kolkata')::date and p_schedule_time < (now() at time zone 'Asia/Kolkata')::time) then raise exception 'Choose a future start date and time'; end if;
  insert into public.task_schedules (task_id, created_by, task_payload, repeat_type, interval_days, start_date, schedule_time, next_run_at)
  values (v_task_id, v_uid, p_task_payload, p_repeat_type, case when p_repeat_type = 'custom' then p_interval_days else null end, p_start_date, p_schedule_time, (p_start_date + p_schedule_time) at time zone 'Asia/Kolkata')
  returning id into v_schedule_id;
  return v_schedule_id;
end
$$;

create or replace function public.set_task_schedule_enabled(p_task_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_next_run timestamptz;
begin
  select schedule.* into v_schedule
    from public.task_schedules schedule
   where schedule.current_task_id = p_task_id
   for update;
  if not found then
    raise exception 'Schedule controls are available on the latest scheduled task only';
  end if;
  if auth.uid() is distinct from v_schedule.created_by then
    raise exception 'Only the person who assigned this scheduled task can manage its schedule';
  end if;

  if p_enabled and v_schedule.repeat_type = 'weekly' and v_schedule.run_count >= 7 then
    raise exception 'The one-week schedule has already finished';
  end if;
  if p_enabled and v_schedule.repeat_type = 'custom'
     and v_schedule.run_count >= coalesce(v_schedule.interval_days, 0) then
    raise exception 'The custom schedule has already finished';
  end if;

  v_next_run := v_schedule.next_run_at;
  if p_enabled then
    -- Daily and custom schedules both run on consecutive days. For custom,
    -- interval_days is the total number of runs, not the day gap.
    while v_next_run <= now() loop
      v_next_run := (v_next_run at time zone 'Asia/Kolkata' + interval '1 day')
        at time zone 'Asia/Kolkata';
    end loop;
    if v_schedule.repeat_type = 'weekly'
       and ((v_schedule.start_date + 7) + v_schedule.schedule_time)
           at time zone 'Asia/Kolkata' <= now() then
      raise exception 'The one-week schedule has already finished';
    end if;
  end if;

  update public.task_schedules
     set enabled = p_enabled, next_run_at = v_next_run, updated_at = now()
   where id = v_schedule.id;
end
$$;

create or replace function public.update_task_schedule(
  p_task_id uuid,
  p_repeat_type text,
  p_interval_days integer,
  p_start_date date,
  p_schedule_time time,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_payload jsonb;
  v_next_run timestamptz;
begin
  select s.* into v_schedule
    from public.task_schedules s
   where s.id = (select task.schedule_id from public.tasks task where task.id = p_task_id)
      or s.task_id = p_task_id
   limit 1 for update;
  if not found then raise exception 'Task schedule not found'; end if;
  if auth.uid() is distinct from v_schedule.created_by then
    raise exception 'Only the person who assigned this scheduled task can edit its schedule';
  end if;
  if p_repeat_type is null or p_repeat_type not in ('daily', 'weekly', 'custom')
     or (p_repeat_type = 'custom' and (p_interval_days is null or p_interval_days < 1 or p_interval_days > 3650))
     or (p_repeat_type <> 'custom' and p_interval_days is not null)
     or p_start_date is null or p_schedule_time is null or p_enabled is null then
    raise exception 'Choose a valid repeat schedule, duration, start date, and time';
  end if;

  select jsonb_build_object(
           'title', t.title, 'description', t.description, 'client_id', t.client_id,
           'ticket_id', t.ticket_id, 'visibility', t.visibility, 'type', t.type,
           'priority', t.priority, 'is_urgent', t.is_urgent, 'service_id', t.service_id,
           'department_id', t.department_id, 'platform_id', t.platform_id,
           'assignee_id', t.assignee_id, 'estimated_hours', t.estimated_hours,
           'due_date', null, 'deadline_type', null
         ) into v_payload
    from public.tasks t where t.id = p_task_id and t.is_scheduled;
  if not found then raise exception 'Scheduled task not found'; end if;

  v_next_run := (p_start_date + p_schedule_time) at time zone 'Asia/Kolkata';
  if p_enabled then
    while v_next_run <= now() loop
      v_next_run := (v_next_run at time zone 'Asia/Kolkata' + interval '1 day')
        at time zone 'Asia/Kolkata';
    end loop;
  end if;

  update public.task_schedules
     set task_payload = v_payload,
         repeat_type = p_repeat_type,
         interval_days = case when p_repeat_type = 'custom' then p_interval_days else null end,
         start_date = p_start_date,
         schedule_time = p_schedule_time,
         next_run_at = v_next_run,
         run_count = 0,
         enabled = p_enabled,
         updated_at = now()
   where id = v_schedule.id;
end
$$;

create or replace function public.process_task_schedules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_payload jsonb;
  v_task_id uuid;
  v_due_date date;
  v_next_run timestamptz;
  v_count integer := 0;
begin
  for v_schedule in
    select * from public.task_schedules
     where enabled and next_run_at <= now()
     order by next_run_at
     for update skip locked
  loop
    v_due_date := greatest(
      (v_schedule.next_run_at at time zone 'Asia/Kolkata')::date,
      (now() at time zone 'Asia/Kolkata')::date
    );
    v_payload := v_schedule.task_payload;

    if nullif(v_payload->>'ticket_id', '') is not null and exists (
      select 1 from public.tickets
       where id = nullif(v_payload->>'ticket_id', '')::uuid and status = 'closed'
    ) then
      update public.task_schedules set enabled = false, updated_at = now() where id = v_schedule.id;
      continue;
    end if;

    v_task_id := case
      when v_schedule.run_count = 0 and not exists (select 1 from public.tasks where id = v_schedule.task_id)
        then v_schedule.task_id
      else gen_random_uuid()
    end;
    perform set_config('app.bypass_guard', 'on', true);
    insert into public.tasks (
      id, client_id, title, description, type, status, priority, is_urgent, source, visibility,
      department_id, platform_id, service_id, due_date, deadline_type, estimated_hours,
      created_by, assignee_id, assigned_by, assigned_at, ticket_id, is_scheduled, schedule_id
    ) values (
      v_task_id, nullif(v_payload->>'client_id', '')::uuid, trim(v_payload->>'title'),
      nullif(v_payload->>'description', ''), coalesce(nullif(v_payload->>'type', ''), 'task')::public.task_type,
      'todo', coalesce(nullif(v_payload->>'priority', ''), 'P3')::public.task_priority,
      coalesce((v_payload->>'is_urgent')::boolean, false), 'internal', coalesce(v_payload->>'visibility', 'public'),
      nullif(v_payload->>'department_id', '')::uuid, nullif(v_payload->>'platform_id', '')::uuid,
      nullif(v_payload->>'service_id', '')::uuid, v_due_date, null,
      nullif(v_payload->>'estimated_hours', '')::numeric, v_schedule.created_by,
      nullif(v_payload->>'assignee_id', '')::uuid, v_schedule.created_by, now(),
      nullif(v_payload->>'ticket_id', '')::uuid, true, v_schedule.id
    );
    insert into public.task_attachments (task_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
    select v_task_id, a.uploaded_by, a.storage_path, a.file_name, a.mime_type, a.size_bytes
      from public.task_schedule_attachments a where a.schedule_id = v_schedule.id;
    insert into public.task_activity (task_id, actor_id, action, new_value, is_client_visible)
    values (v_task_id, v_schedule.created_by, 'scheduled_assignment', v_due_date::text, true);

    v_count := v_count + 1;
    if (v_schedule.repeat_type = 'weekly' and v_schedule.run_count + 1 >= 7)
       or (v_schedule.repeat_type = 'custom' and v_schedule.run_count + 1 >= v_schedule.interval_days) then
      update public.task_schedules
         set enabled = false, run_count = run_count + 1, updated_at = now()
       where id = v_schedule.id;
    else
      v_next_run := (v_schedule.next_run_at at time zone 'Asia/Kolkata' + interval '1 day')
        at time zone 'Asia/Kolkata';
      while v_next_run <= now() loop
        v_next_run := (v_next_run at time zone 'Asia/Kolkata' + interval '1 day')
          at time zone 'Asia/Kolkata';
      end loop;
      update public.task_schedules
         set next_run_at = v_next_run, run_count = run_count + 1, updated_at = now()
       where id = v_schedule.id;
    end if;
  end loop;
  return v_count;
end
$$;

revoke all on function public.process_task_schedules() from public, anon, authenticated;
