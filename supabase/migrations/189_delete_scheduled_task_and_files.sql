-- Deleting a paused current scheduled task also deletes its schedule and
-- returns stored file paths so the API can remove the objects from Storage.
drop function if exists public.delete_current_scheduled_task(uuid);
create function public.delete_current_scheduled_task(p_task_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.task_schedules%rowtype;
  v_paths text[];
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

  select coalesce(array_agg(distinct attachment.storage_path), '{}'::text[])
    into v_paths
    from public.task_schedule_attachments attachment
   where attachment.schedule_id = v_schedule.id;

  -- Both records and attachment metadata are removed transactionally.
  delete from public.task_schedules where id = v_schedule.id;
  delete from public.tasks where id = p_task_id;
  return v_paths;
end
$$;

revoke all on function public.delete_current_scheduled_task(uuid) from public, anon;
grant execute on function public.delete_current_scheduled_task(uuid) to authenticated;

-- Remove paused schedule definitions whose original and current task rows have
-- already been deleted. Their attachment metadata cascades with the schedule.
delete from public.task_schedules schedule
where not schedule.enabled
  and not exists (
    select 1 from public.tasks task
    where task.id = schedule.task_id
       or task.id = schedule.current_task_id
  );
