-- 077: A client's message must reach the people allowed to answer it.
--
--   071 only told Managers and Super Admins about a client's message when the
--   ticket had nobody assigned:
--
--     select p.id from profiles p
--     where coalesce(v_is_client, false) and t.assignee_id is null and ...
--
--   The moment a ticket was assigned, that branch stopped firing, and the only
--   remaining recipient was the assignee -- who is usually an employee, and
--   employees are filtered out of client-visible messages because they are not
--   allowed to read them. So a client could write on an assigned ticket and
--   nobody was told at all. The unread count on the ticket list was the only
--   sign, and that is only seen by someone already looking at the list.
--
--   A client's public message now notifies every active Manager and Super
--   Admin, assigned or not, because they are exactly the people who may read
--   and answer it. Internal notes and staff replies are unchanged.
-- Safe to re-run.

create or replace function public.notify_ticket_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  v_author uuid := new.author_id;
  v_author_nm text;
  v_is_client boolean;
  v_title text;
  v_title_cl text;
  v_body text := left(new.body, 140);
begin
  select * into t from tickets where id = new.ticket_id;
  if t.id is null then return null; end if;

  select coalesce(nullif(full_name, ''), email), role = 'client'
    into v_author_nm, v_is_client
  from profiles where id = v_author;

  v_title := 'TK-' || t.ticket_number || ': ' || coalesce(v_author_nm, 'Someone') || ' commented on "' || left(t.subject, 60) || '"';
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
    -- Whoever may answer a client hears about it, assigned or not.
    select p.id from profiles p
    where coalesce(v_is_client, false) and not new.is_internal
      and p.status = 'active' and p.role in ('super_admin', 'admin')
  ) r
  join profiles p on p.id = r.id and p.status = 'active'
  where r.id is not null
    and r.id is distinct from v_author
    and (new.is_internal or p.role not in ('team_lead', 'employee'));

  return null;
end $$;
