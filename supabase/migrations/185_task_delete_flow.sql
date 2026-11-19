-- Delete tasks as one checked database action, with durable notices for both
-- participants. The notification rows intentionally do not link to the task,
-- because task deletion cascades rows that reference its id.

create or replace function public.delete_task_for_assigner(p_task_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_paths text[];
  v_recipient uuid;
  v_actor_name text;
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

  if v_task.assigned_by is distinct from auth.uid()
     and not (
       v_task.assigned_by is null
       and v_task.assignee_id is null
       and v_task.created_by is not distinct from auth.uid()
     ) then
    raise exception 'Only the person who assigned this task can delete it';
  end if;

  if exists (
    select 1 from public.task_schedules s where s.current_task_id = v_task.id
  ) then
    raise exception 'Pause the schedule before deleting its current task';
  end if;

  select coalesce(array_agg(a.storage_path), '{}'::text[])
  into v_paths
  from public.task_attachments a
  where a.task_id = v_task.id;

  select coalesce(nullif(btrim(p.full_name), ''), 'A staff member')
  into v_actor_name
  from public.profiles p
  where p.id = auth.uid();

  for v_recipient in
    select distinct recipient_id
    from unnest(array[v_task.assignee_id, v_task.assigned_by]) as recipients(recipient_id)
    where recipient_id is not null
  loop
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (
      v_recipient,
      'task_deleted',
      'Task deleted',
      format('%s (GP-%s) was deleted by %s.', v_task.title, v_task.task_number, v_actor_name),
      null,
      v_task.client_id
    );
  end loop;

  delete from public.tasks where id = v_task.id;
  return v_paths;
end
$$;

revoke all on function public.delete_task_for_assigner(uuid) from public, anon;
grant execute on function public.delete_task_for_assigner(uuid) to authenticated;
