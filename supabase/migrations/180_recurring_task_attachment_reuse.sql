-- Recurring task occurrences reuse the files uploaded to their schedule.
-- A storage object may therefore be linked to multiple task occurrences, while
-- duplicate links on the same task remain prevented.
alter table public.task_attachments
  drop constraint if exists task_attachments_storage_path_key;

create unique index if not exists task_attachments_task_storage_path_key
  on public.task_attachments (task_id, storage_path);

-- Migration 173 already copies schedule attachment metadata to each occurrence.
-- Keep that behavior; the per-task uniqueness above lets each occurrence link
-- the same stored object without making the entire scheduler transaction fail.
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
