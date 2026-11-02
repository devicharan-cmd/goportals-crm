-- Ticket status is derived from its active linked tasks:
--   no tasks or an unassigned active task -> Unassigned
--   every active task assigned           -> Assigned
--   every active task completed           -> Closed
-- Cancelled tasks do not block closure.

alter table public.tickets disable trigger tickets_notify;

drop trigger if exists tickets_b_assign_stage on public.tickets;
drop function if exists public.set_ticket_assigned_stage();
drop trigger if exists tickets_z_awaiting_client_guard on public.tickets;
drop function if exists public.guard_ticket_awaiting_client();

do $$
begin
  perform set_config('app.bypass_guard', 'on', true);
  perform set_config('app.suppress_activity', 'on', true);

  with task_rollup as (
    select ticket_id,
           count(*) filter (where status <> 'cancelled') as active_tasks,
           count(*) filter (where status = 'completed') as completed_tasks,
           count(*) filter (where status <> 'cancelled' and assignee_id is null) as unassigned_tasks
    from public.tasks
    where ticket_id is not null
    group by ticket_id
  ),
  targets as (
    select t.id,
           case
             when coalesce(r.active_tasks, 0) > 0
               and r.completed_tasks = r.active_tasks then 'closed'::public.ticket_status
             when coalesce(r.active_tasks, 0) > 0
               and r.unassigned_tasks = 0 then 'assigned'::public.ticket_status
             else 'unassigned'::public.ticket_status
           end as status
    from public.tickets t
    left join task_rollup r on r.ticket_id = t.id
  )
  update public.tickets t
     set status = targets.status
    from targets
   where t.id = targets.id;
end
$$;

alter table public.tickets
  alter column status set default 'unassigned'::public.ticket_status;
alter table public.tickets
  drop constraint if exists tickets_status_limited_check;
alter table public.tickets
  add constraint tickets_status_limited_check
  check (status::text in ('unassigned', 'assigned', 'closed'));

alter table public.tickets enable trigger tickets_notify;

create or replace function public.ticket_status_label(p_status public.ticket_status) returns text
language sql immutable set search_path = public as $$
  select case p_status
    when 'unassigned' then 'Unassigned'
    when 'assigned' then 'Assigned'
    when 'closed' then 'Closed'
    else replace(p_status::text, '_', ' ')
  end
$$;

create or replace function public.ticket_status_label_client(p_status public.ticket_status) returns text
language sql immutable set search_path = public as $$
  select ticket_status_label(p_status)
$$;

create or replace function public.ticket_visible(
  p_client_id uuid,
  p_department_id uuid,
  p_assignee_id uuid,
  p_created_by uuid,
  p_is_urgent boolean,
  p_status public.ticket_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (
    auth_role() in ('super_admin', 'admin')
    or (auth_role() = 'client' and client_id = my_client_id())
  );

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (
    recipient_id = auth.uid()
    and (ticket_id is null or auth_role() in ('super_admin', 'admin', 'client'))
  );

create or replace function public.guard_ticket_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_uid uuid := auth.uid();
begin
  if v_uid is null or current_setting('app.bypass_guard', true) = 'on' then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if tg_op = 'INSERT' then
    if v_role not in ('super_admin', 'admin', 'client') then
      raise exception 'Only managers, Super Admins, and clients can create tickets';
    end if;

    new.created_by := v_uid;
    new.status := 'unassigned';

    if v_role = 'client' then
      new.client_id := my_client_id();
      new.assignee_id := null;
      new.assigned_by := null;
      new.assigned_at := null;
      new.department_id := null;
    elsif new.assignee_id is not null then
      if not can_assign(new.assignee_id) then
        raise exception 'You cannot assign tickets to this person';
      end if;
      new.assigned_by := v_uid;
      new.assigned_at := now();
    end if;

    if new.ecommerce_account_id is not null and not exists (
      select 1 from public.ecommerce_accounts ea
      where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
    ) then
      raise exception 'That e-commerce account does not belong to this client';
    end if;
    return new;
  end if;

  if old.status = 'closed' then
    raise exception 'This ticket is closed; request changes to reopen its tasks';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Ticket status is determined by linked task assignments and completion';
  end if;

  if v_role = 'client' then
    if old.created_by is distinct from v_uid
       or old.status <> 'unassigned'
       or exists (select 1 from public.tasks where ticket_id = old.id) then
      raise exception 'You can only edit your own ticket before tasks are created';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new),
         array['subject', 'description', 'details', 'priority', 'is_urgent', 'ecommerce_account_id', 'updated_at']) then
      raise exception 'You can only edit ticket details before work is created';
    end if;
  elsif v_role not in ('super_admin', 'admin') then
    raise exception 'Only managers and Super Admins can update tickets';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tickets to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  if new.ecommerce_account_id is not null and not exists (
    select 1 from public.ecommerce_accounts ea
    where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
  ) then
    raise exception 'That e-commerce account does not belong to this client';
  end if;

  return new;
end
$$;

create or replace function public.refresh_ticket_status(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_current public.ticket_status;
  v_active integer;
  v_completed integer;
  v_unassigned integer;
  v_target public.ticket_status;
  v_prior_bypass text;
begin
  select status into v_current
  from public.tickets
  where id = p_ticket_id
  for update;
  if not found then return; end if;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status <> 'cancelled' and assignee_id is null)
    into v_active, v_completed, v_unassigned
    from public.tasks
   where ticket_id = p_ticket_id;

  if v_active = 0 then
    v_target := 'unassigned';
  elsif v_completed = v_active then
    v_target := 'closed';
  elsif v_unassigned = 0 then
    v_target := 'assigned';
  else
    v_target := 'unassigned';
  end if;

  if v_target is distinct from v_current then
    v_prior_bypass := current_setting('app.bypass_guard', true);
    perform set_config('app.bypass_guard', 'on', true);
    update public.tickets set status = v_target where id = p_ticket_id;
    perform set_config('app.bypass_guard', coalesce(v_prior_bypass, ''), true);
  end if;
end
$$;

create or replace function public.guard_closed_ticket_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_status public.ticket_status;
  v_check_new_ticket boolean;
begin
  if current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_check_new_ticket := true;
  else
    v_check_new_ticket := new.ticket_id is distinct from old.ticket_id;
  end if;

  if tg_op = 'UPDATE' then
    if old.ticket_id is not null then
      select status into v_ticket_status
        from public.tickets
       where id = old.ticket_id;
      if v_ticket_status = 'closed'
         and (new.ticket_id is distinct from old.ticket_id or new.status is distinct from old.status) then
        raise exception 'Reopen this ticket through the request-changes action before changing its tasks';
      end if;
    end if;
  end if;

  if new.ticket_id is not null and v_check_new_ticket then
    select status into v_ticket_status
      from public.tickets
     where id = new.ticket_id;
    if v_ticket_status = 'closed' then
      raise exception 'Reopen this ticket through the request-changes action before adding tasks';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists tasks_a_closed_ticket_guard on public.tasks;
create trigger tasks_a_closed_ticket_guard
  before insert or update of ticket_id, status on public.tasks
  for each row execute function public.guard_closed_ticket_tasks();

create or replace function public.sync_ticket_status_from_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_ticket_status(old.ticket_id);
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if old.ticket_id is distinct from new.ticket_id then
      perform public.refresh_ticket_status(old.ticket_id);
    end if;
  end if;
  perform public.refresh_ticket_status(new.ticket_id);
  return null;
end
$$;

drop trigger if exists tasks_d_sync_ticket_progress on public.tasks;
drop function if exists public.sync_ticket_progress_from_tasks();
drop trigger if exists tasks_d_sync_ticket_status on public.tasks;
create constraint trigger tasks_d_sync_ticket_status
  after insert or delete or update of ticket_id, assignee_id, status on public.tasks
  deferrable initially deferred
  for each row execute function public.sync_ticket_status_from_tasks();

revoke all on function public.refresh_ticket_status(uuid) from public, anon, authenticated;
revoke all on function public.guard_closed_ticket_tasks() from public, anon, authenticated;
revoke all on function public.sync_ticket_status_from_tasks() from public, anon, authenticated;

drop function if exists public.close_ticket(uuid);
drop function if exists public.claim_ticket(uuid);

create or replace function public.reopen_ticket(p_ticket_id uuid, p_feedback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_uid uuid := auth.uid();
  v_client uuid;
  v_status public.ticket_status;
  v_reopened integer;
begin
  select client_id, status into v_client, v_status
    from public.tickets
   where id = p_ticket_id
   for update;
  if not found then raise exception 'Ticket not found'; end if;
  if v_status <> 'closed' then raise exception 'Only a closed ticket can be reopened'; end if;

  if v_role in ('super_admin', 'admin') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    if length(trim(coalesce(p_feedback, ''))) = 0 then
      raise exception 'Please tell us what needs to change before sending this back';
    end if;
  else
    raise exception 'Only the client or a manager can request changes';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks
     set status = 'changes_requested'
   where ticket_id = p_ticket_id and status = 'completed';
  get diagnostics v_reopened = row_count;
  if v_reopened = 0 then
    raise exception 'This ticket has no completed tasks to reopen';
  end if;

  if p_feedback is not null and length(trim(p_feedback)) > 0 then
    insert into public.ticket_comments (ticket_id, author_id, body, is_internal)
    values (p_ticket_id, v_uid, p_feedback, false);
  end if;
end
$$;

revoke execute on function public.reopen_ticket(uuid, text) from anon, public;
grant execute on function public.reopen_ticket(uuid, text) to authenticated;

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
     where p.status = 'active' and p.role in ('super_admin', 'admin');
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    select owner_id into v_client_owner from public.clients where id = new.client_id;
    v_recipient := coalesce(v_client_owner, new.created_by);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and v_recipient is not null and v_recipient is distinct from v_uid then
    insert into public.notifications (recipient_id, type, title, body, ticket_id, client_id)
    values (v_recipient, 'status_changed',
            'TK-' || new.ticket_number || ': Moved to ' ||
              case when exists (select 1 from public.profiles where id = v_recipient and role = 'client')
                   then public.ticket_status_label_client(new.status)
                   else public.ticket_status_label(new.status) end,
            new.subject, new.id, new.client_id);
  end if;

  return null;
end
$$;

create or replace function public.notify_ticket_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t public.tickets%rowtype;
  v_author_name text;
  v_is_client boolean;
  v_title text;
  v_title_client text;
begin
  select * into t from public.tickets where id = new.ticket_id;
  if t.id is null then return null; end if;

  select coalesce(nullif(full_name, ''), email), role = 'client'
    into v_author_name, v_is_client
    from public.profiles
   where id = new.author_id;

  v_title := 'TK-' || t.ticket_number || ': ' || coalesce(v_author_name, 'Someone')
             || ' commented on "' || left(t.subject, 60) || '"';
  v_title_client := 'TK-' || t.ticket_number || ': '
             || case when coalesce(v_is_client, false) then coalesce(v_author_name, 'Someone') else 'GoPortals team' end
             || ' commented on "' || left(t.subject, 60) || '"';

  insert into public.notifications (recipient_id, type, title, body, ticket_id, client_id)
  select p.id, 'comment',
         case when p.role = 'client' then v_title_client else v_title end,
         left(new.body, 140), t.id, t.client_id
    from public.profiles p
   where p.status = 'active'
     and p.id is distinct from new.author_id
     and (
       (coalesce(v_is_client, false) and not new.is_internal and p.role in ('super_admin', 'admin'))
       or (not new.is_internal and p.role = 'client'
           and p.id = (select owner_id from public.clients where id = t.client_id))
     );

  return null;
end
$$;

create or replace function public.send_ticket_comment(
  p_ticket_id uuid,
  p_body text,
  p_is_internal boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role := auth_role();
  v_ticket public.tickets%rowtype;
  v_comment_id uuid;
begin
  if v_uid is null or v_role is null then
    raise exception 'You must be signed in with an active account';
  end if;
  if p_body is null or trim(p_body) = '' then
    raise exception 'Message cannot be empty';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or not public.can_see_ticket(p_ticket_id) then
    raise exception 'You cannot access this ticket';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This ticket is closed';
  end if;

  if v_role = 'client' then
    if v_ticket.client_id is distinct from public.my_client_id() then
      raise exception 'You can only reply to your own tickets';
    end if;
    p_is_internal := false;
  elsif v_role in ('super_admin', 'admin') then
    null;
  else
    raise exception 'Only managers, Super Admins, and the ticket client can message on tickets';
  end if;

  insert into public.ticket_comments (ticket_id, author_id, body, is_internal)
  values (p_ticket_id, v_uid, trim(p_body), p_is_internal)
  returning id into v_comment_id;

  return v_comment_id;
end
$$;

revoke execute on function public.send_ticket_comment(uuid, text, boolean) from public, anon;
grant execute on function public.send_ticket_comment(uuid, text, boolean) to authenticated;
