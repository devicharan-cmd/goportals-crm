-- ============================================================
-- 053: Fix two notification gaps found while comparing the live ticket/task
--   flow against the intended workflow diagram.
--
--   1. Stale role check: notify_ticket_change(), notify_ticket_comment(),
--      notify_task_change() and notify_task_comment() all still gate staff
--      notifications on p.role = 'manager' — a role retired by migration
--      041 (`update profiles set role='admin' where role='manager'`, see
--      042). Since migration 042 ran, no profile has role='manager', so
--      admins and team_leads have been getting ZERO notifications of new
--      client tickets/tasks or comments on unassigned ones — only
--      super_admin did. Fixed to admin (global) + team_lead who leads the
--      relevant department (department_members.is_lead).
--
--   2. Status-change notifications only ever reached the ticket/task's
--      created_by, never its assignee. That's the gap behind "rework sends
--      no notification to the employee": when a team_lead sets a task to
--      changes_requested, created_by is usually the team_lead themselves
--      (the reviewer), so the existing check self-suppresses and the
--      assignee never hears about it. Added a second notification to the
--      assignee on any status change (when distinct from the actor and
--      from created_by, so we don't double-notify the same person).
--
-- Safe to re-run (create or replace on existing trigger functions, no
-- schema change).
-- ============================================================

create or replace function public.notify_ticket_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    select p.id, 'client_ticket',
           'TK-' || new.ticket_number || ': New ' || replace(new.category::text, '_', ' ') || ' request from '
             || (select company_name from clients where id = new.client_id),
           new.subject, new.id, new.client_id
    from profiles p
    where p.status = 'active'
      and (p.role in ('super_admin', 'admin')
           or (p.role = 'team_lead' and new.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = new.department_id
                             and dm.is_lead)));
  end if;

  if new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.assignee_id, 'assigned', 'TK-' || new.ticket_number || ': Ticket assigned to you', new.subject, new.id, new.client_id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.created_by, 'status_changed',
            'TK-' || new.ticket_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.subject, new.id, new.client_id);
  end if;

  -- Status changed → tell the assignee too (the block above only reaches
  -- created_by, which is often the reviewer themself on a rework/reopen).
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and new.assignee_id is distinct from new.created_by then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.assignee_id, 'status_changed',
            'TK-' || new.ticket_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.subject, new.id, new.client_id);
  end if;

  return null;
end $$;

create or replace function public.notify_ticket_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t           tickets%rowtype;
  v_author    uuid := new.author_id;
  v_author_nm text;
  v_is_client boolean;
  v_title     text;
  v_body      text := left(new.body, 140);
begin
  select * into t from tickets where id = new.ticket_id;
  if t.id is null then return null; end if;

  select coalesce(nullif(full_name, ''), email), role = 'client'
    into v_author_nm, v_is_client
  from profiles where id = v_author;
  v_title := 'TK-' || t.ticket_number || ': ' || coalesce(v_author_nm, 'Someone') || ' commented on "' || left(t.subject, 60) || '"';

  insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
  select distinct r.id, 'comment', v_title, v_body, t.id, t.client_id
  from (
    select t.assignee_id as id
    union
    select t.created_by
    where t.created_by is not null
      and (not new.is_internal
           or not exists (select 1 from profiles where id = t.created_by and role = 'client'))
    union
    select p.id from profiles p
    where coalesce(v_is_client, false) and t.assignee_id is null and p.status = 'active'
      and (p.role in ('super_admin', 'admin')
           or (p.role = 'team_lead' and t.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = t.department_id
                             and dm.is_lead)))
  ) r
  join profiles p on p.id = r.id and p.status = 'active'
  where r.id is not null
    and r.id is distinct from v_author;

  return null;
end $$;

create or replace function public.notify_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- New client task → super admins + admins + leads of its department
  if tg_op = 'INSERT' and new.source = 'client' then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    select p.id, 'client_task',
           'GP-' || new.task_number || ': New request from ' || (select company_name from clients where id = new.client_id),
           new.title, new.id, new.client_id
    from profiles p
    where p.status = 'active'
      and (p.role in ('super_admin', 'admin')
           or (p.role = 'team_lead' and new.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = new.department_id
                             and dm.is_lead)));
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

  -- Status changed → tell the assignee too (e.g. a team_lead sending a
  -- task to changes_requested — created_by is often the reviewer, so the
  -- block above alone never reaches the person who actually has to rework it).
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and new.assignee_id is distinct from new.created_by then
    insert into notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.assignee_id, 'status_changed',
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
    -- client comment on an unassigned task → admins + leads of the department
    select p.id from profiles p
    where coalesce(v_is_client, false) and t.assignee_id is null and p.status = 'active'
      and (p.role in ('super_admin', 'admin')
           or (p.role = 'team_lead' and t.department_id is not null
               and exists (select 1 from department_members dm
                           where dm.profile_id = p.id and dm.department_id = t.department_id
                             and dm.is_lead)))
  ) r
  join profiles p on p.id = r.id and p.status = 'active'
  where r.id is not null
    and r.id is distinct from v_author;

  return null;
end $$;
