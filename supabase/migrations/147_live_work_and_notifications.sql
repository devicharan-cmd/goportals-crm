-- Publish the rows needed by app-wide live task, ticket, notification, and
-- approval updates. Safe to re-run.
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is missing';
  end if;

  if not exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and puballtables
  ) then
    foreach v_table in array array['tasks', 'tickets', 'notifications', 'clients'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$$;

alter table public.tasks replica identity full;
alter table public.tickets replica identity full;
alter table public.notifications replica identity full;

-- New tickets are visible to all active manager roles in the staff ticket
-- workflow. Keep assignment and status notifications tied to the same rows.
create or replace function public.notify_ticket_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_client_owner uuid;
  v_recipient uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, type, title, body, ticket_id, client_id)
    select p.id, 'client_ticket',
           'TK-' || new.ticket_number || ': New ' || replace(new.category::text, '_', ' ') || ' request from '
             || (select company_name from public.clients where id = new.client_id),
           new.subject, new.id, new.client_id
    from public.profiles p
    where p.status = 'active'
      and p.role in ('super_admin', 'manager', 'team_lead')
      and p.id is distinct from v_uid
      and p.id is distinct from new.assignee_id;
  end if;

  if new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into public.notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (new.assignee_id, 'assigned',
            'TK-' || new.ticket_number || ': Ticket assigned to you', new.subject, new.id, new.client_id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    select c.owner_id into v_client_owner
    from public.clients c where c.id = new.client_id;
    v_recipient := coalesce(v_client_owner, new.created_by);

    if v_recipient is not null and v_recipient is distinct from v_uid then
      insert into public.notifications (recipient_id, type, title, body, ticket_id, client_id)
      values (v_recipient, 'status_changed',
              'TK-' || new.ticket_number || ': Moved to ' ||
                case when exists (
                  select 1 from public.profiles p where p.id = v_recipient and p.role = 'client'
                ) then public.ticket_status_label_client(new.status)
                else public.ticket_status_label(new.status) end,
              new.subject, new.id, new.client_id);
    end if;

    if new.assignee_id is not null
       and new.assignee_id is distinct from v_uid
       and new.assignee_id is distinct from v_recipient then
      insert into public.notifications (recipient_id, type, title, body, ticket_id, client_id)
      values (new.assignee_id, 'status_changed',
              'TK-' || new.ticket_number || ': Moved to ' || public.ticket_status_label(new.status),
              new.subject, new.id, new.client_id);
    end if;
  end if;

  return null;
end
$$;
