-- Keep a pointer to the newest task occurrence for each recurring schedule.
-- This is the occurrence that owns the enable/disable control.
alter table public.task_schedules
  add column if not exists current_task_id uuid references public.tasks(id) on delete set null;

update public.task_schedules schedule
   set current_task_id = coalesce(
     (select task.id
        from public.tasks task
       where task.schedule_id = schedule.id
       order by task.created_at desc, task.id desc
       limit 1),
     (select task.id from public.tasks task where task.id = schedule.task_id limit 1)
   )
 where schedule.current_task_id is distinct from coalesce(
     (select task.id
        from public.tasks task
       where task.schedule_id = schedule.id
       order by task.created_at desc, task.id desc
       limit 1),
     (select task.id from public.tasks task where task.id = schedule.task_id limit 1)
   );

create or replace function public.sync_current_scheduled_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.schedule_id is not null then
      update public.task_schedules
         set current_task_id = new.id, updated_at = now()
       where id = new.schedule_id;
    end if;
    return new;
  end if;

  if old.schedule_id is not null then
    update public.task_schedules schedule
       set current_task_id = (
             select task.id
               from public.tasks task
              where task.schedule_id = old.schedule_id
              order by task.created_at desc, task.id desc
              limit 1
           ),
           updated_at = now()
     where schedule.id = old.schedule_id;
  end if;
  return old;
end
$$;

revoke all on function public.sync_current_scheduled_task() from public, anon, authenticated;
drop trigger if exists tasks_current_scheduled_task on public.tasks;
create trigger tasks_current_scheduled_task
  after insert or delete on public.tasks
  for each row execute function public.sync_current_scheduled_task();

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

  v_next_run := v_schedule.next_run_at;
  v_interval := case when v_schedule.repeat_type = 'custom' then v_schedule.interval_days else 1 end;
  if p_enabled then
    if v_schedule.repeat_type = 'weekly'
       and ((v_schedule.start_date + 7) + v_schedule.schedule_time) at time zone 'Asia/Kolkata' <= now() then
      raise exception 'The one-week schedule has already finished';
    end if;
    while v_next_run <= now() loop
      v_next_run := (v_next_run at time zone 'Asia/Kolkata' + v_interval * interval '1 day')
        at time zone 'Asia/Kolkata';
    end loop;
  end if;

  update public.task_schedules
     set enabled = p_enabled, next_run_at = v_next_run, updated_at = now()
   where id = v_schedule.id;
end
$$;

revoke all on function public.set_task_schedule_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_task_schedule_enabled(uuid, boolean) to authenticated;
