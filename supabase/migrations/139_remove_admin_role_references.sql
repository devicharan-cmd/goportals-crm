-- ============================================================
-- 139: Remove all 'admin' role references from database functions and policies.
--
-- Only standard roles are recognized:
--   super_admin, manager, team_lead, employee, client
--
-- All places previously checking 'admin' now cleanly check 'manager'.
-- ============================================================

-- ── 1. ticket_visible ────────────────────────────────────────────────────────
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

-- ── 2. guard_ticket_write ────────────────────────────────────────────────────
create or replace function public.guard_ticket_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_role   app_role := auth_role();
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
        raise exception 'Only managers and super admins can mark tickets urgent';
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

-- ── 3. close_ticket ──────────────────────────────────────────────────────────
create or replace function public.close_ticket(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   app_role := auth_role();
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

-- ── 4. reopen_ticket ─────────────────────────────────────────────────────────
create or replace function public.reopen_ticket(p_ticket_id uuid, p_feedback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
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

-- ── 5. set_ticket_status ─────────────────────────────────────────────────────
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

-- ── 6. RLS Policies on tickets ───────────────────────────────────────────────
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (
    auth_role() in ('super_admin', 'manager')
    or (auth_role() = 'client' and client_id = my_client_id())
  );

drop policy if exists tickets_delete on public.tickets;
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
