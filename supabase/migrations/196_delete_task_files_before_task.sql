-- A task must remain intact when any of its removable files cannot be removed.
-- This preflight validates the same deletion rules as the final delete RPC and
-- returns only files that are no longer shared by another task or schedule.
create or replace function public.task_file_paths_for_deletion(
  p_task_id uuid,
  p_delete_schedule boolean default false
) returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_schedule public.task_schedules%rowtype;
  v_paths text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete this task';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role <> 'client'
  ) then
    raise exception 'Only active staff can delete tasks';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;
  if not found then
    raise exception 'This task was already deleted or is no longer available';
  end if;

  if public.is_former_task_assignee(v_task.id) then
    raise exception 'A former assignee cannot delete this task';
  end if;

  if p_delete_schedule then
    select schedule.* into v_schedule
    from public.task_schedules schedule
    where schedule.current_task_id = v_task.id
    for update;
    if not found then
      raise exception 'Only the current scheduled task can be deleted with its schedule';
    end if;
    if auth.uid() is distinct from v_schedule.created_by then
      raise exception 'Only the person who assigned this scheduled task can delete it';
    end if;
    if v_schedule.enabled then
      raise exception 'Pause the schedule before deleting its current task';
    end if;

    with candidate_paths as (
      select storage_path from public.task_attachments where task_id = v_task.id
      union
      select storage_path from public.task_schedule_attachments where schedule_id = v_schedule.id
    )
    select coalesce(array_agg(path order by path), '{}'::text[])
    into v_paths
    from (
      select storage_path as path
      from candidate_paths candidate
      where not exists (
        select 1 from public.task_attachments other
        where other.storage_path = candidate.storage_path
          and other.task_id <> v_task.id
      )
      and not exists (
        select 1 from public.task_schedule_attachments other
        where other.storage_path = candidate.storage_path
          and other.schedule_id <> v_schedule.id
      )
    ) removable;
  else
    if exists (
      select 1 from public.task_schedules schedule where schedule.current_task_id = v_task.id
    ) then
      raise exception 'Pause the schedule before deleting its current task';
    end if;
    if v_task.assigned_by is distinct from auth.uid()
       and not (
         v_task.assigned_by is null
         and v_task.assignee_id is null
         and v_task.created_by is not distinct from auth.uid()
       ) then
      raise exception 'Only the person who assigned this task can delete it';
    end if;

    select coalesce(array_agg(attachment.storage_path order by attachment.storage_path), '{}'::text[])
    into v_paths
    from public.task_attachments attachment
    where attachment.task_id = v_task.id
      and not exists (
        select 1 from public.task_attachments other
        where other.storage_path = attachment.storage_path
          and other.task_id <> v_task.id
      )
      and not exists (
        select 1 from public.task_schedule_attachments schedule_attachment
        where schedule_attachment.storage_path = attachment.storage_path
      );
  end if;

  return v_paths;
end;
$$;

revoke all on function public.task_file_paths_for_deletion(uuid, boolean) from public, anon;
grant execute on function public.task_file_paths_for_deletion(uuid, boolean) to authenticated;
