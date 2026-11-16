-- ============================================================
-- 138: Simplify ticket_status enum to 3 values only.
--
-- Old enum:  new | under_review | awaiting_clarification | assigned
--            | in_progress | ready_for_client | resolved | reopened | closed
--
-- New enum:  unassigned | assigned | closed
--
-- Data mapping:
--   new, under_review, awaiting_clarification  → unassigned
--   assigned, in_progress, ready_for_client,
--   resolved, reopened                         → assigned
--   closed                                     → closed
-- ============================================================

-- ── Step 1: Drop policies and indexes depending on tickets.status ────────────
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;
drop policy if exists tickets_insert on public.tickets;

-- Drop indexes using 'status' (especially partial index with predicate status <> 'closed')
drop index if exists public.tickets_urgent_idx;
drop index if exists public.tickets_status_idx;
drop index if exists public.tickets_status_summary_idx;

-- ── Step 2: Create temporary enum v3 and alter table column ──────────────────
create type public.ticket_status_v3 as enum ('unassigned', 'assigned', 'closed');

alter table public.tickets
  alter column status drop default;

alter table public.tickets
  alter column status type public.ticket_status_v3
  using (
    case status::text
      when 'new'                    then 'unassigned'
      when 'under_review'           then 'unassigned'
      when 'awaiting_clarification' then 'unassigned'
      when 'assigned'               then 'assigned'
      when 'in_progress'            then 'assigned'
      when 'ready_for_client'       then 'assigned'
      when 'resolved'               then 'assigned'
      when 'reopened'               then 'assigned'
      when 'closed'                 then 'closed'
      else                               'unassigned'
    end::public.ticket_status_v3
  );

alter table public.tickets
  alter column status set default 'unassigned'::public.ticket_status_v3;

-- ── Step 3: Drop old ticket_status type with CASCADE ─────────────────────────
drop type public.ticket_status cascade;

-- Rename new enum to ticket_status
alter type public.ticket_status_v3 rename to ticket_status;

-- ── Step 4: Recreate helper functions with new ticket_status ─────────────────
create or replace function public.ticket_status_label(p_status public.ticket_status) returns text
language sql immutable set search_path = public as $$
  select case p_status::text
    when 'unassigned' then 'Unassigned'
    when 'assigned'   then 'Assigned'
    when 'closed'     then 'Closed'
    else initcap(replace(p_status::text, '_', ' '))
  end;
$$;

create or replace function public.ticket_status_label_client(p_status public.ticket_status) returns text
language sql immutable set search_path = public as $$
  select case p_status::text
    when 'unassigned' then 'Unassigned'
    when 'assigned'   then 'Assigned'
    when 'closed'     then 'Closed'
    else initcap(replace(p_status::text, '_', ' '))
  end;
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
    when 'manager' then true
    when 'team_lead' then p_assignee_id = auth.uid()
    when 'employee' then p_assignee_id = auth.uid()
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.ticket_visible(
      t.client_id, t.department_id, t.assignee_id, t.created_by,
      t.is_urgent, t.status
    )
    from public.tickets t where t.id = p_ticket_id
  ), false)
$$;

create or replace function public.client_ticket_assignment_summary(p_ticket_id uuid)
returns table (status public.ticket_status, staff_assignee_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth.uid() is null or auth_role()::text <> 'client' then
    raise exception 'Only clients can view their ticket assignment summary';
  end if;

  select t.client_id
    into v_client_id
    from public.tickets t
   where t.id = p_ticket_id;

  if not found or v_client_id is distinct from my_client_id() then
    raise exception 'Ticket not found or it does not belong to your client account';
  end if;

  return query
  with task_rollup as (
    select count(*) filter (where task.status <> 'cancelled') as active_tasks,
           count(*) filter (where task.status = 'completed') as completed_tasks,
           count(*) filter (where task.status <> 'cancelled' and task.assignee_id is null) as unassigned_tasks
      from public.tasks task
     where task.ticket_id = p_ticket_id
  ),
  task_staff as (
    select distinct case
             when assignee.role = 'client' then task.assigned_by
             else task.assignee_id
           end as staff_id
      from public.tasks task
      left join public.profiles assignee on assignee.id = task.assignee_id
     where task.ticket_id = p_ticket_id
       and task.status <> 'cancelled'
  )
  select case
           when rollup.active_tasks = 0 then 'unassigned'::public.ticket_status
           when rollup.completed_tasks = rollup.active_tasks then 'closed'::public.ticket_status
           when rollup.unassigned_tasks = 0 then 'assigned'::public.ticket_status
           else 'unassigned'::public.ticket_status
         end,
         coalesce(array(
           select staff.staff_id
             from task_staff staff
             join public.profiles profile
               on profile.id = staff.staff_id
              and profile.role <> 'client'
              and profile.status = 'active'
            where staff.staff_id is not null
            order by staff.staff_id
         ), '{}'::uuid[])
    from task_rollup rollup;
end
$$;

revoke all on function public.client_ticket_assignment_summary(uuid) from public, anon, authenticated;
grant execute on function public.client_ticket_assignment_summary(uuid) to authenticated;

-- ── Step 5: guard_ticket_write ───────────────────────────────────────────────
create or replace function public.guard_ticket_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text := auth_role()::text;
  v_is_claim boolean;
begin
  if v_uid is null then
    raise exception 'You must be signed in';
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if tg_op = 'UPDATE' and old.status = 'closed' then
    raise exception 'This ticket is closed and cannot be changed — create a new ticket for further work';
  end if;

  if tg_op = 'UPDATE' and new.status = 'closed' and old.status <> 'closed' then
    raise exception 'Closing a ticket requires using the close action';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    if v_role = 'client' then
      new.client_id     := my_client_id();
      new.status        := 'unassigned';
      new.assignee_id   := null;
      new.assigned_by   := null;
      new.assigned_at   := null;
      new.department_id := null;
    else
      if new.is_urgent and v_role = 'employee' then
        raise exception 'Only managers and admins can mark tickets urgent';
      end if;
      if new.assignee_id is not null then
        if not can_assign(new.assignee_id) then
          raise exception 'You cannot assign tickets to this person';
        end if;
        new.assigned_by := v_uid;
        new.assigned_at := now();
      end if;
    end if;

    if new.ecommerce_account_id is not null and not exists (
      select 1 from ecommerce_accounts ea
      where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
    ) then
      raise exception 'That e-commerce account does not belong to this client';
    end if;

    return new;
  end if;

  -- UPDATE
  v_is_claim := old.assignee_id is null
            and old.is_urgent
            and old.status <> 'closed'
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'client' then
    if coalesce(old.created_by <> v_uid, true) or old.status <> 'unassigned' then
      raise exception 'You can only edit your own tickets while they are still unassigned';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new),
         array['subject', 'description', 'details', 'priority', 'is_urgent', 'ecommerce_account_id', 'updated_at']) then
      raise exception 'You can only change the subject, description, details, priority, urgency and e-commerce account';
    end if;

  elsif v_role = 'employee' then
    if not v_is_claim then
      if not (coalesce(old.assignee_id = v_uid, false) or coalesce(old.created_by = v_uid, false)) then
        raise exception 'You can only update tickets assigned to you';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;

-- ── Step 6: close_ticket ─────────────────────────────────────────────────────
create or replace function public.close_ticket(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   text := auth_role()::text;
  v_client uuid;
  v_status public.ticket_status;
begin
  select client_id, status into v_client, v_status from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_status = 'closed' then
    raise exception 'This ticket is already closed';
  end if;
  if v_status <> 'assigned' then
    raise exception 'Only an assigned ticket can be closed';
  end if;

  if v_role in ('super_admin', 'manager') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    null;
  else
    raise exception 'Only the client or a manager can close a ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets set status = 'closed' where id = p_ticket_id;
end $$;

revoke execute on function public.close_ticket(uuid) from anon, public;
grant  execute on function public.close_ticket(uuid) to authenticated;

-- ── Step 7: reopen_ticket ────────────────────────────────────────────────────
create or replace function public.reopen_ticket(p_ticket_id uuid, p_feedback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role     text := auth_role()::text;
  v_uid      uuid := auth.uid();
  v_client   uuid;
  v_status   public.ticket_status;
  v_reopened integer;
begin
  select client_id, status into v_client, v_status
    from public.tickets
   where id = p_ticket_id
   for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_status <> 'closed' then
    raise exception 'Only a closed ticket can be reopened';
  end if;
  if v_role in ('super_admin', 'manager') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    if length(trim(coalesce(p_feedback, ''))) = 0 then
      raise exception 'Please tell us what needs to change before sending this back';
    end if;
  else
    raise exception 'Only the client or a manager can reopen a ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets set status = 'assigned' where id = p_ticket_id;
  update public.tasks
     set status = 'changes_requested'
   where ticket_id = p_ticket_id and status = 'completed';
  get diagnostics v_reopened = row_count;
  if v_reopened = 0 then
    raise exception 'This ticket has no completed tasks to reopen';
  end if;
end
$$;

revoke execute on function public.reopen_ticket(uuid, text) from anon, public;
grant  execute on function public.reopen_ticket(uuid, text) to authenticated;

-- ── Step 8: set_ticket_status ────────────────────────────────────────────────
create or replace function public.set_ticket_status(
  p_ticket_id uuid,
  p_status public.ticket_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prior_bypass text := current_setting('app.bypass_guard', true);
begin
  if auth_role() not in ('super_admin', 'manager') then
    raise exception 'Only a Super Admin or Manager can change ticket status';
  end if;
  if p_status is null then
    raise exception 'Choose a ticket status';
  end if;
  perform 1 from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets
     set status = p_status
   where id = p_ticket_id
     and status is distinct from p_status;
  perform set_config('app.bypass_guard', coalesce(v_prior_bypass, ''), true);
end
$$;

revoke execute on function public.set_ticket_status(uuid, public.ticket_status) from anon, public;
grant  execute on function public.set_ticket_status(uuid, public.ticket_status) to authenticated;

-- ── Step 9: client_can_delete_ticket ─────────────────────────────────────────
create or replace function public.client_can_delete_ticket(p_ticket_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role()::text = 'client'
     and exists (
       select 1
         from public.tickets ticket
        where ticket.id = p_ticket_id
          and ticket.client_id = my_client_id()
          and ticket.created_by = auth.uid()
          and ticket.status = 'unassigned'::public.ticket_status
          and not exists (
            select 1 from public.tasks task where task.ticket_id = ticket.id
          )
     )
$$;

-- ── Step 10: Recreate RLS policies ───────────────────────────────────────────
create policy tickets_select on public.tickets
  for select to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status));

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (
    auth_role() in ('super_admin', 'manager')
    or (auth_role() = 'client' and client_id = my_client_id())
  );

create policy tickets_update on public.tickets
  for update to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status))
  with check (true);

create policy tickets_delete on public.tickets
  for delete to authenticated
  using (
    status = 'unassigned'::public.ticket_status
    and not exists (select 1 from public.tasks t where t.ticket_id = id)
    and (
      is_super_admin()
      or auth_role() = 'manager'
      or public.client_can_delete_ticket(id)
    )
  );

-- ── Step 11: Recreate indexes on tickets ─────────────────────────────────────
create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_urgent_idx on public.tickets (created_at) where is_urgent and status <> 'closed';
create index if not exists tickets_status_summary_idx on public.tickets (status, created_at desc, id asc);
