-- A schedule is a series, independent from any occurrence's status. Each run
-- creates a new task and leaves all prior occurrences unchanged.
alter table public.tasks
  add column if not exists schedule_id uuid references public.task_schedules(id) on delete set null;
create index if not exists tasks_schedule_id_idx on public.tasks (schedule_id) where schedule_id is not null;

update public.tasks task
   set schedule_id = schedule.id
  from public.task_schedules schedule
 where task.is_scheduled
   and task.schedule_id is null
   and schedule.task_id = task.id;

drop policy if exists task_schedules_select on public.task_schedules;
create policy task_schedules_select on public.task_schedules for select to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()
    or exists (
      select 1 from public.tasks task
       where task.schedule_id = task_schedules.id and task.assignee_id = auth.uid()
    )
    or exists (
      select 1 from public.tasks task
       where task.id = task_schedules.task_id and task.assignee_id = auth.uid()
    )
  );

drop policy if exists task_files_select on storage.objects;
create policy task_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'task-files'
    and (
      (
        can_see_task(public.try_uuid((storage.foldername(name))[1]))
        and (
          auth_role() <> 'client'
          or exists (
            select 1 from public.tasks task
             where task.id = public.try_uuid((storage.foldername(name))[1])
               and task.assignee_id = auth.uid()
          )
          or exists (
            select 1
              from public.task_attachments attachment
              join public.task_comments comment on comment.id = attachment.comment_id
             where attachment.storage_path = storage.objects.name
               and attachment.task_id = public.try_uuid((storage.foldername(name))[1])
               and not comment.is_internal
          )
        )
      )
      or exists (
        select 1
          from public.task_attachments attachment
          join public.tasks task on task.id = attachment.task_id
         where attachment.storage_path = storage.objects.name
           and attachment.comment_id is null
           and task.schedule_id is not null
           and public.can_see_task(task.id)
           and (auth_role() <> 'client' or (task.visibility = 'public' and task.assignee_id = auth.uid()))
      )
    )
  );

create or replace function public.sync_task_schedule_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is distinct from old.assignee_id then
    update public.task_schedules
       set task_payload = jsonb_set(
             task_payload,
             '{assignee_id}',
             coalesce(to_jsonb(new.assignee_id), 'null'::jsonb),
             true
           ),
           updated_at = now()
     where id = coalesce(new.schedule_id, (select schedule.id from public.task_schedules schedule where schedule.task_id = new.id));
  end if;
  return new;
end
$$;

revoke all on function public.sync_task_schedule_assignee() from public, anon, authenticated;

drop trigger if exists sync_task_schedule_assignee on public.tasks;
create trigger sync_task_schedule_assignee
  after update of assignee_id on public.tasks
  for each row execute function public.sync_task_schedule_assignee();
drop trigger if exists stop_task_schedule_on_terminal_status on public.tasks;

create or replace function public.set_task_schedule_enabled(p_task_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_next_run timestamptz;
  v_interval integer;
begin
  select s.* into v_schedule
    from public.task_schedules s
   where s.id = (select task.schedule_id from public.tasks task where task.id = p_task_id)
      or s.task_id = p_task_id
   limit 1
   for update;
  if not found then
    raise exception 'Task schedule not found';
  end if;
  if auth.uid() is distinct from v_schedule.created_by then
    raise exception 'Only the person who assigned this scheduled task can manage its schedule';
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

  update public.task_schedules
     set enabled = p_enabled, next_run_at = v_next_run, updated_at = now()
   where id = v_schedule.id;
end
$$;

revoke all on function public.set_task_schedule_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_task_schedule_enabled(uuid, boolean) to authenticated;

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
  v_interval integer;
  v_next_run timestamptz;
begin
  select s.* into v_schedule
    from public.task_schedules s
   where s.id = (select task.schedule_id from public.tasks task where task.id = p_task_id)
      or s.task_id = p_task_id
   limit 1
   for update;
  if not found then
    raise exception 'Task schedule not found';
  end if;
  if auth.uid() is distinct from v_schedule.created_by then
    raise exception 'Only the person who assigned this scheduled task can edit its schedule';
  end if;
  if p_repeat_type is null or p_repeat_type not in ('daily', 'weekly', 'custom')
     or (p_repeat_type = 'custom' and (p_interval_days is null or p_interval_days < 2 or p_interval_days > 3650))
     or (p_repeat_type <> 'custom' and p_interval_days is not null)
     or p_start_date is null or p_schedule_time is null or p_enabled is null then
    raise exception 'Choose a valid repeat schedule, start date, and time';
  end if;

  select jsonb_build_object(
           'title', t.title,
           'description', t.description,
           'client_id', t.client_id,
           'ticket_id', t.ticket_id,
           'visibility', t.visibility,
           'type', t.type,
           'priority', t.priority,
           'is_urgent', t.is_urgent,
           'service_id', t.service_id,
           'department_id', t.department_id,
           'platform_id', t.platform_id,
           'assignee_id', t.assignee_id,
           'estimated_hours', t.estimated_hours,
           'due_date', null,
           'deadline_type', null
         )
    into v_payload
    from public.tasks t
   where t.id = p_task_id and t.is_scheduled;
  if not found then
    raise exception 'Scheduled task not found';
  end if;
  v_interval := case when p_repeat_type = 'custom' then p_interval_days else 1 end;
  v_next_run := (p_start_date + p_schedule_time) at time zone 'Asia/Kolkata';
  if p_enabled then
    while v_next_run <= now() loop
      v_next_run := (v_next_run at time zone 'Asia/Kolkata' + v_interval * interval '1 day') at time zone 'Asia/Kolkata';
    end loop;
    if p_repeat_type = 'weekly'
       and v_next_run >= ((p_start_date + 7) + p_schedule_time) at time zone 'Asia/Kolkata' then
      raise exception 'The one-week schedule has already finished';
    end if;
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

revoke all on function public.update_task_schedule(uuid, text, integer, date, time, boolean) from public, anon;
grant execute on function public.update_task_schedule(uuid, text, integer, date, time, boolean) to authenticated;

create or replace function public.process_task_schedules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
    v_due_date := greatest(
      (v_schedule.next_run_at at time zone 'Asia/Kolkata')::date,
      (now() at time zone 'Asia/Kolkata')::date
    );
    v_payload := v_schedule.task_payload;
    select exists (select 1 from public.tasks where id = v_schedule.task_id) into v_task_exists;

    if nullif(v_payload->>'ticket_id', '') is not null and exists (
      select 1 from public.tickets
       where id = nullif(v_payload->>'ticket_id', '')::uuid and status = 'closed'
    ) then
      update public.task_schedules set enabled = false, updated_at = now() where id = v_schedule.id;
      continue;
    end if;

    -- The schedule's task_id reserves the first occurrence ID. Every later
    -- run gets a fresh task ID so history and each occurrence's status remain intact.
    v_task_id := case
      when v_schedule.run_count = 0 and not v_task_exists then v_schedule.task_id
      else gen_random_uuid()
    end;
    perform set_config('app.bypass_guard', 'on', true);
    insert into public.tasks (
      id, client_id, title, description, type, status, priority, is_urgent, source, visibility,
      department_id, platform_id, service_id, due_date, deadline_type, estimated_hours,
      created_by, assignee_id, assigned_by, assigned_at, ticket_id, is_scheduled, schedule_id
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
      true,
      v_schedule.id
    );
    insert into public.task_attachments (task_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
    select v_task_id, a.uploaded_by, a.storage_path, a.file_name, a.mime_type, a.size_bytes
      from public.task_schedule_attachments a where a.schedule_id = v_schedule.id;
    insert into public.task_activity (task_id, actor_id, action, new_value, is_client_visible)
    values (v_task_id, v_schedule.created_by, 'scheduled_assignment', v_due_date::text, true);

    v_count := v_count + 1;
    if v_schedule.repeat_type = 'weekly' and v_schedule.run_count + 1 >= 7 then
      update public.task_schedules set enabled = false, run_count = run_count + 1, updated_at = now()
       where id = v_schedule.id;
    else
      v_next_run := (v_schedule.next_run_at at time zone 'Asia/Kolkata'
        + case when v_schedule.repeat_type = 'custom' then v_schedule.interval_days else 1 end * interval '1 day')
        at time zone 'Asia/Kolkata';
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

revoke all on function public.process_task_schedules() from public, anon, authenticated;
