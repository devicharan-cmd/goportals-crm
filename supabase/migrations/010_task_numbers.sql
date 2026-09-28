-- ============================================================
-- 010: Short task IDs — GP-1001, GP-1002, … (one running number for all tasks).
--   • tasks.task_number: filled automatically on insert, never changes
--   • existing tasks get numbers in the order they were created
--   • notification titles start with the ID, e.g. "GP-1024: Task assigned to you"
-- The app shows it as 'GP-' || task_number.
-- ============================================================

create sequence if not exists task_number_seq start 1001;

alter table tasks add column if not exists task_number bigint;

-- Backfill existing tasks, oldest first
do $$
declare r record;
begin
  for r in select id from tasks where task_number is null order by created_at, id loop
    update tasks set task_number = nextval('task_number_seq') where id = r.id;
  end loop;
end $$;

alter table tasks alter column task_number set default nextval('task_number_seq');
alter table tasks alter column task_number set not null;
alter sequence task_number_seq owned by tasks.task_number;
-- Logged-in users create tasks, so they need to draw the next number.
grant usage, select on sequence task_number_seq to authenticated, service_role;
create unique index if not exists tasks_task_number_key on tasks (task_number);

-- The number can never be edited (runs before tasks_a_guard — triggers fire alphabetically)
create or replace function public.keep_task_number() returns trigger
language plpgsql as $$
begin
  new.task_number := old.task_number;
  return new;
end $$;

drop trigger if exists tasks_0_keep_number on tasks;
create trigger tasks_0_keep_number before update on tasks
  for each row execute function keep_task_number();

-- Notification titles with the task ID
create or replace function public.notify_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- New client task → super admins + managers of its department
  if tg_op = 'INSERT' and new.source = 'client' then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    select p.id, 'client_task',
           'GP-' || new.task_number || ': New request from ' || (select company_name from clients where id = new.client_id),
           new.title, new.id, new.client_id
    from profiles p
    where p.status = 'active'
      and (p.role = 'super_admin'
           or (p.role = 'manager' and new.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = new.department_id)));
  end if;

  -- Assigned to someone else
  if new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.assignee_id, 'assigned', 'GP-' || new.task_number || ': Task assigned to you', new.title, new.id, new.client_id);
  end if;

  -- Status changed → tell the creator (incl. the client)
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.created_by, 'status_changed',
            'GP-' || new.task_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.title, new.id, new.client_id);
  end if;

  return null;
end $$;

create or replace function public.notify_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t            tasks%rowtype;
  v_author     uuid := new.author_id;
  v_author_nm  text;
  v_is_client  boolean;
  v_title      text;
  v_body       text := left(new.body, 140);
begin
  select * into t from tasks where id = new.task_id;
  if t.id is null then return null; end if;

  select coalesce(nullif(full_name, ''), email), role = 'client'
    into v_author_nm, v_is_client
  from profiles where id = v_author;
  v_title := 'GP-' || t.task_number || ': ' || coalesce(v_author_nm, 'Someone') || ' commented on "' || left(t.title, 60) || '"';

  insert into notifications (recipient_id, type, title, body, task_id, client_id)
  select distinct r.id, 'comment', v_title, v_body, t.id, t.client_id
  from (
    -- assignee
    select t.assignee_id as id
    union
    -- task creator (a client creator only sees non-internal comments)
    select t.created_by
    where t.created_by is not null
      and (not new.is_internal
           or not exists (select 1 from profiles where id = t.created_by and role = 'client'))
    union
    -- client comment on an unassigned task → admins + managers of the department
    select p.id from profiles p
    where coalesce(v_is_client, false) and t.assignee_id is null and p.status = 'active'
      and (p.role = 'super_admin'
           or (p.role = 'manager' and t.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = t.department_id)))
  ) r
  join profiles p on p.id = r.id and p.status = 'active'
  where r.id is not null
    and r.id is distinct from v_author;

  return null;
end $$;
