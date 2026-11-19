-- A schedule's current occurrence cannot be deleted while the schedule is
-- enabled. Once paused, delete that occurrence through an RPC which leaves the
-- schedule paused and clears its control pointer. Older occurrences stay normal
-- deletable tasks and do not affect the schedule.

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (
    not public.is_former_task_assignee(id)
    and not exists (
      select 1
        from public.task_schedules schedule
       where schedule.current_task_id = tasks.id
    )
    and (
      assigned_by = auth.uid()
      or (assigned_by is null and assignee_id is null and created_by = auth.uid())
    )
  );

create or replace function public.pause_current_schedule_before_task_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.task_schedules
     set enabled = false, current_task_id = null, updated_at = now()
   where current_task_id = old.id;
  return old;
end
$$;

revoke all on function public.pause_current_schedule_before_task_delete() from public, anon, authenticated;
drop trigger if exists tasks_pause_current_schedule_before_delete on public.tasks;
create trigger tasks_pause_current_schedule_before_delete
  before delete on public.tasks
  for each row execute function public.pause_current_schedule_before_task_delete();

-- Keep the controller on newly-created occurrences. Deleting an old occurrence
-- must not move the control onto a historical task.
create or replace function public.sync_current_scheduled_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.schedule_id is not null then
    update public.task_schedules
       set current_task_id = new.id, updated_at = now()
     where id = new.schedule_id;
  end if;
  return new;
end
$$;

revoke all on function public.sync_current_scheduled_task() from public, anon, authenticated;
drop trigger if exists tasks_current_scheduled_task on public.tasks;
create trigger tasks_current_scheduled_task
  after insert on public.tasks
  for each row execute function public.sync_current_scheduled_task();

create or replace function public.delete_current_scheduled_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.task_schedules%rowtype;
begin
  select schedule.* into v_schedule
    from public.task_schedules schedule
    join public.tasks task on task.id = schedule.current_task_id
   where task.id = p_task_id
   for update of schedule;
  if not found then
    raise exception 'Only the current scheduled task can be deleted with its schedule';
  end if;
  if auth.uid() is distinct from v_schedule.created_by
     or public.is_former_task_assignee(p_task_id) then
    raise exception 'Only the person who assigned this scheduled task can delete it';
  end if;
  if v_schedule.enabled then
    raise exception 'Pause the schedule before deleting its current task';
  end if;

  update public.task_schedules
     set enabled = false, current_task_id = null, updated_at = now()
   where id = v_schedule.id;

  delete from public.tasks where id = p_task_id;
end
$$;

revoke all on function public.delete_current_scheduled_task(uuid) from public, anon;
grant execute on function public.delete_current_scheduled_task(uuid) to authenticated;
