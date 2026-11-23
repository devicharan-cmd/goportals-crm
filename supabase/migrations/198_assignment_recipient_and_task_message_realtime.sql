-- Assignment notifications belong only to the person receiving the task.
-- Also publish task discussion rows so open conversations update immediately.

create or replace function public.notify_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- New client task -> active staff responsible for the department.
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

  -- Assignment notifications go only to the selected assignee. The assigner
  -- must not receive a notification for work they just assigned.
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not (tg_op = 'INSERT' and coalesce(new.is_scheduled, false)) then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.assignee_id, 'assigned',
            'GP-' || new.task_number || ': Task assigned to you', new.title, new.id, new.client_id);
  end if;

  -- Status changes still notify the task creator.
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.created_by, 'status_changed',
            'GP-' || new.task_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.title, new.id, new.client_id);
  end if;

  -- Status changes also notify the assignee when they are not the actor or creator.
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments'
    ) then
      execute 'alter publication supabase_realtime add table public.task_comments';
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_attachments'
    ) then
      execute 'alter publication supabase_realtime add table public.task_attachments';
    end if;
  end if;
end
$$;

alter table public.task_comments replica identity full;
alter table public.task_attachments replica identity full;
