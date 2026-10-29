-- ============================================================
-- 064: What a client reads in a notification.
--
--   1. Staff were named by email. The title was built once from the
--      author's name, falling back to their email address, and sent to
--      everyone — so a client's notification read
--      "TK-1004: cineplexmovieworld@gmail.com commented on ...".
--      The portal calls staff "GoPortals team" everywhere else; the
--      notification now does the same when the reader is a client.
--
--   2. Status titles printed the raw enum ("Moved to under review",
--      "Moved to ready for client"). They now read like the labels in
--      the app: "Moved to Under review".
-- Safe to re-run.
-- ============================================================

create or replace function public.ticket_status_label(p_status ticket_status) returns text
language sql immutable set search_path = public as $$
  select case p_status
    when 'new'                    then 'New'
    when 'under_review'           then 'Under review'
    when 'awaiting_clarification' then 'Awaiting client reply'
    when 'assigned'               then 'Assigned'
    when 'in_progress'            then 'In progress'
    when 'ready_for_client'       then 'Ready for client'
    when 'resolved'               then 'Resolved'
    when 'reopened'               then 'Reopened'
    when 'closed'                 then 'Closed'
  end
$$;

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
            'TK-' || new.ticket_number || ': Moved to ' || ticket_status_label(new.status), new.subject, new.id, new.client_id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and new.assignee_id is distinct from new.created_by then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.assignee_id, 'status_changed',
            'TK-' || new.ticket_number || ': Moved to ' || ticket_status_label(new.status), new.subject, new.id, new.client_id);
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
  v_title_cl  text;
  v_body      text := left(new.body, 140);
begin
  select * into t from tickets where id = new.ticket_id;
  if t.id is null then return null; end if;

  select coalesce(nullif(full_name, ''), email), role = 'client'
    into v_author_nm, v_is_client
  from profiles where id = v_author;

  v_title := 'TK-' || t.ticket_number || ': ' || coalesce(v_author_nm, 'Someone') || ' commented on "' || left(t.subject, 60) || '"';
  -- What a client reads: staff are the team, never a person's email.
  v_title_cl := 'TK-' || t.ticket_number || ': '
             || case when coalesce(v_is_client, false) then coalesce(v_author_nm, 'Someone') else 'GoPortals team' end
             || ' commented on "' || left(t.subject, 60) || '"';

  insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
  select distinct r.id, 'comment',
         case when p.role = 'client' then v_title_cl else v_title end,
         v_body, t.id, t.client_id
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
