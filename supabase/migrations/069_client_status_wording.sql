-- ============================================================
-- 069: Status wording in a client's notification.
--
--   "Awaiting client reply" and "Ready for client" are how the team talks
--   *about* a client. Sent to the client themselves they describe somebody
--   else — the portal now says "Your reply needed" and "Ready for your
--   review", and the notification should match.
--
--   Only the title the client reads changes. Staff recipients keep the
--   existing wording, and no status, permission or row changes.
-- Safe to re-run.
-- ============================================================

create or replace function public.ticket_status_label_client(p_status ticket_status) returns text
language sql immutable set search_path = public as $$
  select case p_status
    when 'awaiting_clarification' then 'Your reply needed'
    when 'ready_for_client'       then 'Ready for your review'
    else ticket_status_label(p_status)
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

  -- The ticket's author: usually the client, so word it for them.
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.created_by, 'status_changed',
            'TK-' || new.ticket_number || ': Moved to ' ||
            case when exists (select 1 from profiles where id = new.created_by and role = 'client')
                 then ticket_status_label_client(new.status)
                 else ticket_status_label(new.status) end,
            new.subject, new.id, new.client_id);
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
