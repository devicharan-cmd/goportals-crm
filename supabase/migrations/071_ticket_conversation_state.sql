-- 071: Protect ticket conversation messages and enforce role-based visibility.
-- Reply-needed is derived from the latest public message, not a ticket status.

create or replace function public.send_ticket_comment(
  p_ticket_id uuid,
  p_body text,
  p_is_internal boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role := auth_role();
  v_ticket tickets%rowtype;
  v_comment_id uuid;
begin
  if v_uid is null or v_role is null then
    raise exception 'You must be signed in with an active account';
  end if;
  if p_body is null or trim(p_body) = '' then
    raise exception 'Message cannot be empty';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found or not can_see_ticket(p_ticket_id) then
    raise exception 'You cannot access this ticket';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This ticket is closed';
  end if;

  if v_role = 'client' then
    if v_ticket.client_id is distinct from my_client_id() then
      raise exception 'You can only reply to your own tickets';
    end if;
    p_is_internal := false;
  elsif v_role in ('super_admin', 'admin') then
    null;
  elsif v_role in ('team_lead', 'employee') then
    if not p_is_internal then
      raise exception 'Only Managers and Super Admins can send messages visible to clients';
    end if;
    p_is_internal := true;
  else
    raise exception 'This role cannot message on tickets';
  end if;

  insert into ticket_comments (ticket_id, author_id, body, is_internal)
  values (p_ticket_id, v_uid, trim(p_body), p_is_internal)
  returning id into v_comment_id;

  -- The first public staff response starts the Manager review stage. Any later
  -- client reply is represented by message order and does not overwrite work status.
  if v_role in ('super_admin', 'admin') and not p_is_internal and v_ticket.status = 'new' then
    update tickets set status = 'under_review' where id = p_ticket_id;
  end if;

  return v_comment_id;
end $$;

revoke execute on function public.send_ticket_comment(uuid, text, boolean) from public, anon;
grant execute on function public.send_ticket_comment(uuid, text, boolean) to authenticated;

-- Require all new ticket comments to use the atomic RPC; this also prevents
-- direct PostgREST inserts from bypassing the role or state-transition checks.
drop policy if exists ticket_comments_insert on ticket_comments;
create policy ticket_comments_insert on ticket_comments for insert to authenticated
  with check (false); -- all new ticket comments go through the atomic RPC above

drop policy if exists ticket_comments_select on ticket_comments;
create policy ticket_comments_select on ticket_comments for select to authenticated
  using (
    can_see_ticket(ticket_id)
    and (
      auth_role() in ('super_admin', 'admin')
      or (auth_role() in ('team_lead', 'employee') and is_internal)
      or (auth_role() = 'client' and not is_internal and exists (
        select 1 from tickets t where t.id = ticket_id and t.client_id = my_client_id()
      ))
    )
  );

-- Do not send client-facing comment notifications (which include a message
-- excerpt) to roles that cannot read the public conversation.
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
    and r.id is distinct from v_author
    and (new.is_internal or p.role not in ('team_lead', 'employee'));

  return null;
end $$;

-- Status changes that put a ticket on hold are reserved for Managers and
-- Super Admins, including direct authenticated table updates.
create or replace function public.guard_ticket_awaiting_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.status = 'awaiting_clarification' or old.status = 'awaiting_clarification')
     and old.status is distinct from new.status
     and current_setting('app.bypass_guard', true) is distinct from 'on'
     and auth.uid() is not null
     and coalesce(auth_role() not in ('super_admin', 'admin'), true) then
    raise exception 'Only Managers and Super Admins can request a client reply';
  end if;
  return new;
end $$;

drop trigger if exists tickets_z_awaiting_client_guard on tickets;
create trigger tickets_z_awaiting_client_guard
  before update of status on tickets
  for each row execute function public.guard_ticket_awaiting_client();

-- Task progress must not silently clear a pending client question. A client
-- reply changes the status to under_review and resumes normal task sync.
create or replace function public.sync_ticket_progress_from_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_ticket_status ticket_status;
  v_total integer;
  v_done integer;
  v_target ticket_status;
begin
  v_ticket_id := case when tg_op = 'DELETE' then old.ticket_id else new.ticket_id end;
  if v_ticket_id is null then return null; end if;

  select status into v_ticket_status from tickets where id = v_ticket_id;
  if not found or v_ticket_status in ('closed', 'awaiting_clarification') then return null; end if;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'completed')
    into v_total, v_done
    from tasks where ticket_id = v_ticket_id;

  if v_total = 0 then return null;
  elsif v_done = v_total then v_target := 'resolved';
  else v_target := 'in_progress';
  end if;

  if v_target <> v_ticket_status then
    perform set_config('app.bypass_guard', 'on', true);
    update tickets set status = v_target where id = v_ticket_id;
  end if;
  return null;
end $$;
