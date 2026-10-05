-- ============================================================
-- 008: Notify people when someone comments on a task.
--   • The assigned employee          (e.g. manager comments → employee is notified)
--   • The person who created the task (e.g. employee replies → manager who created it)
--   • The client who raised it — only for comments visible to the client (not internal notes)
--   • If the client comments on an unassigned task → super admins + managers of its department
-- Never notifies the comment's own author. Safe to re-run.
-- ============================================================

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
  v_title := coalesce(v_author_nm, 'Someone') || ' commented on "' || left(t.title, 60) || '"';

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

drop trigger if exists task_comments_notify on task_comments;
create trigger task_comments_notify after insert on task_comments
  for each row execute function notify_task_comment();
