-- Assigned staff can update workflow status, but only another authorized
-- staff member (normally the assigner) may edit or reassign the task itself.
create or replace function public.guard_assignee_task_edits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role := auth_role();
begin
  if v_uid is null
     or v_role is null
     or v_role = 'client'
     or current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

  if v_role <> 'super_admin'
     and old.assignee_id = v_uid
     and old.assigned_by is distinct from v_uid
     and not only_changed(to_jsonb(old), to_jsonb(new), array['status', 'updated_at']) then
    raise exception 'Only the person who assigned this task can edit or reassign it';
  end if;

  return new;
end
$$;

drop trigger if exists tasks_0_assignee_edit_guard on public.tasks;
create trigger tasks_0_assignee_edit_guard
  before update on public.tasks
  for each row execute function public.guard_assignee_task_edits();
