-- Send assignment notifications to both the assigning staff member and the
-- person taking the task. Scheduled task creation already writes its own
-- scheduled_assignment notifications, so avoid duplicating those on insert.
create or replace function public.notify_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- New client task → super admins + admins + leads of its department
  if tg_op = 'INSERT' and new.source = 'client' then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    select p.id, 'client_task',
           'GP-' || new.task_number || ': New request from ' || (select company_name from public.clients where id = new.client_id),
           new.title, new.id, new.client_id
    from public.profiles p
    where p.status = 'active'
      and (p.role in ('super_admin', 'admin')
           or (p.role = 'team_lead' and new.department_id is not null
               and exists (select 1 from public.department_members dm
                           where dm.profile_id = p.id and dm.department_id = new.department_id
                             and dm.is_lead)));
  end if;

  -- Assignment create/reassignment → notify the assignee and the assigning
  -- staff member. Dedup when one person fills both roles.
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not (tg_op = 'INSERT' and coalesce(new.is_scheduled, false)) then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    select recipient_id,
           'assigned',
           case when recipient_id = new.assignee_id
             then 'GP-' || new.task_number || ': Task assigned to you'
             else 'GP-' || new.task_number || ': You assigned a task' end,
           case when recipient_id = new.assignee_id
             then new.title
             else 'You assigned "' || new.title || '" to ' || coalesce(
               (select nullif(p.full_name, '') from public.profiles p where p.id = new.assignee_id),
               'the selected person'
             ) || '.' end,
           new.id,
           new.client_id
    from (
      select distinct targets.id as recipient_id
      from (values (new.assignee_id), (coalesce(v_uid, new.assigned_by))) as targets(id)
      where targets.id is not null
    ) recipients;
  end if;

  -- Status changed → tell the creator (including the client)
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.created_by, 'status_changed',
            'GP-' || new.task_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.title, new.id, new.client_id);
  end if;

  -- Status change notifications also reach the assignee who must act on it.
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and new.assignee_id is distinct from new.created_by then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.assignee_id, 'status_changed',
            'GP-' || new.task_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.title, new.id, new.client_id);
  end if;

  return null;
end
$$;
