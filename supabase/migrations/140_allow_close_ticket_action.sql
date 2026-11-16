-- ============================================================
-- 140: Allow close_ticket() action by checking app.bypass_guard in guard_ticket_write
-- ============================================================

-- 1. Update guard_ticket_write to honor app.bypass_guard = 'on'
create or replace function public.guard_ticket_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_role   app_role := auth_role();
  v_is_claim boolean;
begin
  -- Dedicated RPC actions (like close_ticket, reopen_ticket) set app.bypass_guard = 'on'
  if current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

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

-- 2. Update close_ticket to allow closing open tickets and support staff roles
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

  if v_role in ('super_admin', 'manager') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    null;
  else
    raise exception 'Only the client, manager or super admin can close a ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets set status = 'closed', closed_at = now() where id = p_ticket_id;
end $$;

revoke execute on function public.close_ticket(uuid) from anon, public;
grant  execute on function public.close_ticket(uuid) to authenticated;
