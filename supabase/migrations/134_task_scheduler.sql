-- Store scheduled task definitions until their first occurrence, then reuse one
-- task row for every later assignment. All schedule calculations use IST.
create table if not exists public.task_schedules (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  task_payload jsonb not null,
  repeat_type text not null check (repeat_type in ('daily', 'weekly', 'custom')),
  interval_days integer,
  start_date date not null,
  schedule_time time not null,
  next_run_at timestamptz not null,
  run_count integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_schedules_custom_interval check (
    (repeat_type = 'custom' and interval_days between 2 and 3650)
    or (repeat_type <> 'custom' and interval_days is null)
  )
);
create index if not exists task_schedules_due_idx
  on public.task_schedules (next_run_at) where enabled;

create table if not exists public.task_schedule_attachments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.task_schedules(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists is_scheduled boolean not null default false;
alter table public.task_schedules enable row level security;
alter table public.task_schedule_attachments enable row level security;

drop policy if exists task_schedules_select on public.task_schedules;
create policy task_schedules_select on public.task_schedules for select to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()
    or exists (select 1 from public.tasks t where t.id = task_schedules.task_id and t.assignee_id = auth.uid())
  );
drop policy if exists task_schedule_attachments_select on public.task_schedule_attachments;
create policy task_schedule_attachments_select on public.task_schedule_attachments for select to authenticated
  using (exists (
    select 1 from public.task_schedules s where s.id = schedule_id
      and (s.created_by = auth.uid() or public.is_super_admin())
  ));
drop policy if exists task_schedule_attachments_insert on public.task_schedule_attachments;
create policy task_schedule_attachments_insert on public.task_schedule_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.task_schedules s where s.id = schedule_id and s.created_by = auth.uid() and s.enabled)
    and split_part(storage_path, '/', 1) = (select s.task_id::text from public.task_schedules s where s.id = schedule_id)
  );

-- Add the safe scheduler marker to the existing client task RPC without
-- weakening its client ownership or public visibility filters.
drop function if exists public.client_ticket_tasks(uuid, integer);
create function public.client_ticket_tasks(
  p_task_id uuid default null,
  p_task_number integer default null
) returns table (
  id uuid, task_number bigint, title text, description text, status public.task_status,
  priority public.task_priority, is_urgent boolean, source public.task_source, due_date date,
  assignee_id uuid, assigned_by uuid, client jsonb, platform jsonb, department jsonb,
  service jsonb, created_at timestamptz, ticket_id uuid, ticket jsonb,
  visibility text, is_scheduled boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() is distinct from 'client' then
    raise exception 'This view is only available to client accounts';
  end if;
  return query
  select t.id, t.task_number, t.title, t.description, t.status, t.priority, t.is_urgent,
         t.source, t.due_date, t.assignee_id, t.assigned_by,
         jsonb_build_object('company_name', c.company_name),
         case when p.id is null then null else jsonb_build_object('name', p.name) end,
         case when d.id is null then null else jsonb_build_object('name', d.name) end,
         case when s.id is null then null else jsonb_build_object('name', s.name) end,
         t.created_at, t.ticket_id,
         case when k.id is null then null else jsonb_build_object('id', k.id, 'ticket_number', k.ticket_number, 'subject', k.subject) end,
         t.visibility, t.is_scheduled
    from public.tasks t
    join public.clients c on c.id = t.client_id
    left join public.platforms p on p.id = t.platform_id
    left join public.departments d on d.id = t.department_id
    left join public.services s on s.id = t.service_id
    left join public.tickets k on k.id = t.ticket_id
   where t.visibility = 'public'
     and t.client_id = my_client_id()
     and (t.ticket_id is null or can_see_ticket(t.ticket_id))
     and (p_task_id is null or t.id = p_task_id)
     and (p_task_number is null or t.task_number = p_task_number)
   order by t.created_at desc;
end
$$;
revoke execute on function public.client_ticket_tasks(uuid, integer) from anon, public;
grant execute on function public.client_ticket_tasks(uuid, integer) to authenticated;

create or replace function public.can_upload_scheduled_task_file(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_schedules s
    where s.task_id = p_task_id and s.enabled and s.created_by = auth.uid()
      and not exists (select 1 from public.tasks t where t.id = s.task_id)
  )
$$;

create or replace function public.can_manage_pending_task_schedule_file(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_schedules s
    where s.task_id = p_task_id and s.created_by = auth.uid()
      and not exists (select 1 from public.tasks t where t.id = s.task_id)
  )
$$;

drop policy if exists task_files_insert on storage.objects;
create policy task_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and (
      public.can_see_task(public.try_uuid((storage.foldername(name))[1]))
      or public.can_upload_scheduled_task_file(public.try_uuid((storage.foldername(name))[1]))
    )
  );
drop policy if exists task_files_delete_pending_schedule on storage.objects;
create policy task_files_delete_pending_schedule on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-files'
    and public.can_manage_pending_task_schedule_file(public.try_uuid((storage.foldername(name))[1]))
  );

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
  if v_visibility not in ('public', 'private') or (v_visibility = 'public' and v_client_id is null)
     or (v_ticket_id is not null and (v_client_id is null or v_visibility <> 'public')) then
    raise exception 'Choose valid task visibility and client details';
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

create or replace function public.set_task_schedule_enabled(p_task_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_assignee uuid;
  v_status public.task_status;
  v_next_run timestamptz;
  v_interval integer;
begin
  select s.* into v_schedule from public.task_schedules s where s.task_id = p_task_id for update;
  if not found then raise exception 'Task schedule not found'; end if;
  select t.assignee_id, t.status into v_assignee, v_status from public.tasks t where t.id = p_task_id;
  if not (public.is_super_admin() or auth.uid() = coalesce(v_assignee, nullif(v_schedule.task_payload->>'assignee_id', '')::uuid)) then
    raise exception 'Only the super admin or assigned person can manage this schedule';
  end if;
  if p_enabled and v_status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled tasks cannot be scheduled';
  end if;
  if p_enabled and v_schedule.repeat_type = 'weekly' and v_schedule.run_count >= 7 then
    raise exception 'The one-week schedule has already finished';
  end if;
  v_next_run := v_schedule.next_run_at;
  v_interval := case when v_schedule.repeat_type = 'custom' then v_schedule.interval_days else 1 end;
  if p_enabled then
    if v_schedule.repeat_type = 'weekly'
      and ((v_schedule.start_date + 7) + v_schedule.schedule_time) at time zone 'Asia/Kolkata' <= now() then
      raise exception 'The one-week schedule has already finished';
    end if;
    while v_next_run <= now() loop
      v_next_run := (v_next_run at time zone 'Asia/Kolkata' + v_interval * interval '1 day') at time zone 'Asia/Kolkata';
    end loop;
  end if;
  update public.task_schedules set enabled = p_enabled, next_run_at = v_next_run, updated_at = now() where id = v_schedule.id;
end
$$;

create or replace function public.discard_task_schedule_setup(p_schedule_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.task_schedules s
  where s.id = p_schedule_id and s.created_by = auth.uid()
    and not exists (select 1 from public.tasks t where t.id = s.task_id);
end
$$;

create or replace function public.stop_task_schedule_on_terminal_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('completed', 'cancelled') and new.status is distinct from old.status then
    update public.task_schedules set enabled = false, updated_at = now() where task_id = new.id and enabled;
  end if;
  return null;
end
$$;
drop trigger if exists stop_task_schedule_on_terminal_status on public.tasks;
create trigger stop_task_schedule_on_terminal_status after update of status on public.tasks
  for each row execute function public.stop_task_schedule_on_terminal_status();

create or replace function public.process_task_schedules()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_task_exists boolean;
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
    v_task_id := v_schedule.task_id;
    v_due_date := (v_schedule.next_run_at at time zone 'Asia/Kolkata')::date;
    v_payload := v_schedule.task_payload;
    select exists (select 1 from public.tasks where id = v_task_id) into v_task_exists;

    if nullif(v_payload->>'ticket_id', '') is not null and exists (
      select 1 from public.tickets where id = nullif(v_payload->>'ticket_id', '')::uuid and status = 'closed'
    ) then
      update public.task_schedules set enabled = false, updated_at = now() where id = v_schedule.id;
      continue;
    end if;

    if v_task_exists and exists (select 1 from public.tasks where id = v_task_id and status in ('completed', 'cancelled')) then
      update public.task_schedules set enabled = false, updated_at = now() where id = v_schedule.id;
      continue;
    end if;

    perform set_config('app.bypass_guard', 'on', true);
    if not v_task_exists then
      insert into public.tasks (
        id, client_id, title, description, type, status, priority, is_urgent, source, visibility,
        department_id, platform_id, service_id, due_date, deadline_type, estimated_hours,
        created_by, assignee_id, assigned_by, assigned_at, ticket_id, is_scheduled
      ) values (
        v_task_id,
        nullif(v_payload->>'client_id', '')::uuid,
        trim(v_payload->>'title'),
        nullif(v_payload->>'description', ''),
        coalesce(nullif(v_payload->>'type', ''), 'task')::public.task_type,
        'todo',
        coalesce(nullif(v_payload->>'priority', ''), 'P3')::public.task_priority,
        coalesce((v_payload->>'is_urgent')::boolean, false),
        'internal',
        coalesce(v_payload->>'visibility', 'public'),
        nullif(v_payload->>'department_id', '')::uuid,
        nullif(v_payload->>'platform_id', '')::uuid,
        nullif(v_payload->>'service_id', '')::uuid,
        v_due_date,
        null,
        nullif(v_payload->>'estimated_hours', '')::numeric,
        v_schedule.created_by,
        nullif(v_payload->>'assignee_id', '')::uuid,
        v_schedule.created_by,
        now(),
        nullif(v_payload->>'ticket_id', '')::uuid,
        true
      );
      insert into public.task_attachments (task_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
      select v_task_id, a.uploaded_by, a.storage_path, a.file_name, a.mime_type, a.size_bytes
      from public.task_schedule_attachments a where a.schedule_id = v_schedule.id;
    else
      update public.tasks set due_date = v_due_date, assigned_by = v_schedule.created_by, assigned_at = now()
      where id = v_task_id;
      insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
      select nullif(v_payload->>'assignee_id', '')::uuid, 'scheduled_assignment', 'Scheduled task assigned',
             trim(v_payload->>'title'), v_task_id, nullif(v_payload->>'client_id', '')::uuid
      where nullif(v_payload->>'assignee_id', '') is not null;
      insert into public.task_activity (task_id, actor_id, action, new_value, is_client_visible)
      values (v_task_id, v_schedule.created_by, 'scheduled_assignment', v_due_date::text, true);
    end if;

    v_count := v_count + 1;
    if v_schedule.repeat_type = 'weekly' and v_schedule.run_count + 1 >= 7 then
      update public.task_schedules set enabled = false, run_count = run_count + 1, updated_at = now()
      where id = v_schedule.id;
    else
      v_next_run := (v_schedule.next_run_at at time zone 'Asia/Kolkata'
        + case when v_schedule.repeat_type = 'custom' then v_schedule.interval_days else 1 end * interval '1 day')
        at time zone 'Asia/Kolkata';
      -- If cron was unavailable, do not rapidly replay every missed occurrence.
      -- Run once, then advance to the next future slot.
      while v_next_run <= now() loop
        v_next_run := (v_next_run at time zone 'Asia/Kolkata'
          + case when v_schedule.repeat_type = 'custom' then v_schedule.interval_days else 1 end * interval '1 day')
          at time zone 'Asia/Kolkata';
      end loop;
      if v_schedule.repeat_type = 'weekly'
        and v_next_run >= ((v_schedule.start_date + 7) + v_schedule.schedule_time) at time zone 'Asia/Kolkata' then
        update public.task_schedules set enabled = false, run_count = run_count + 1, updated_at = now()
        where id = v_schedule.id;
      else
        update public.task_schedules set next_run_at = v_next_run, run_count = run_count + 1, updated_at = now()
        where id = v_schedule.id;
      end if;
    end if;
  end loop;
  return v_count;
end
$$;

revoke all on function public.create_task_schedule(uuid, jsonb, text, integer, date, time) from public, anon;
grant execute on function public.create_task_schedule(uuid, jsonb, text, integer, date, time) to authenticated;
revoke all on function public.set_task_schedule_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_task_schedule_enabled(uuid, boolean) to authenticated;
revoke all on function public.discard_task_schedule_setup(uuid) from public, anon;
grant execute on function public.discard_task_schedule_setup(uuid) to authenticated;
revoke all on function public.process_task_schedules() from public, anon, authenticated;

-- Supabase PostgreSQL runs this every minute; row locks and next_run_at make it
-- safe against overlapping invocations.
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'process-task-schedules';
select cron.schedule('process-task-schedules', '* * * * *', 'select public.process_task_schedules()');
