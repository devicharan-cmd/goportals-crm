-- Keep recurring tasks active when they are reassigned, and route future
-- occurrences to the latest assignee. Schedule controls remain owned by the
-- staff member who created and assigned the recurring task.

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
     where task_id = new.id;
  end if;
  return new;
end
$$;

revoke all on function public.sync_task_schedule_assignee() from public, anon, authenticated;

drop trigger if exists sync_task_schedule_assignee on public.tasks;
create trigger sync_task_schedule_assignee
  after update of assignee_id on public.tasks
  for each row execute function public.sync_task_schedule_assignee();

create or replace function public.set_task_schedule_enabled(p_task_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_status public.task_status;
  v_next_run timestamptz;
  v_interval integer;
begin
  select s.* into v_schedule
    from public.task_schedules s
   where s.task_id = p_task_id
   for update;
  if not found then
    raise exception 'Task schedule not found';
  end if;

  if auth.uid() is distinct from v_schedule.created_by then
    raise exception 'Only the person who assigned this scheduled task can manage its schedule';
  end if;

  select t.status into v_status from public.tasks t where t.id = p_task_id;
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

  update public.task_schedules
     set enabled = p_enabled, next_run_at = v_next_run, updated_at = now()
   where id = v_schedule.id;
end
$$;

revoke all on function public.set_task_schedule_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_task_schedule_enabled(uuid, boolean) to authenticated;
