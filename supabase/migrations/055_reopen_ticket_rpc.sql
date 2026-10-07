-- ============================================================
-- 055: reopen_ticket() RPC — the only way a 'resolved' ticket becomes
--   'reopened'. Mirrors close_ticket()'s (048) pattern exactly: the
--   client who owns the ticket can reopen their own resolved ticket
--   ("request changes"), and admin/super_admin can do it administratively.
--   team_lead/employee cannot. Requires its own guard in
--   guard_ticket_write() (same shape as the existing 'closed' transition
--   guard) so the status can't be set to 'reopened' via a plain UPDATE
--   (Kanban drag, the status <select>) — only through this RPC.
--
--   reopen_ticket() sends the ticket's completed task(s) back to
--   'changes_requested' *before* writing the ticket's own status — that
--   task UPDATE synchronously re-fires the auto-progress trigger (047),
--   which will itself try to drop the ticket to 'in_progress'; writing
--   'reopened' afterward in the same function (same bypassed transaction)
--   is what sticks, since both run sequentially, not concurrently.
--   Reusing 'changes_requested' (rather than inventing a new task status)
--   also means 053's new assignee-notification fix fires automatically —
--   the assignee finds out their task was reopened the same way they'd
--   find out a team_lead rejected it.
-- Safe to re-run.
-- ============================================================

create or replace function public.guard_ticket_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
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

  if tg_op = 'UPDATE' and old.status = 'closed' then
    raise exception 'This ticket is closed and cannot be changed — create a new ticket for further work';
  end if;

  if tg_op = 'UPDATE' and new.status = 'closed' and old.status <> 'closed' then
    raise exception 'Closing a ticket requires using the close action on a resolved ticket';
  end if;

  if tg_op = 'UPDATE' and new.status = 'reopened' and old.status <> 'reopened' then
    raise exception 'Reopening a resolved ticket requires using the reopen action';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    if v_role = 'client' then
      new.client_id     := my_client_id();
      new.status        := 'new';
      new.assignee_id   := null;
      new.assigned_by   := null;
      new.assigned_at   := null;
      new.department_id := null;
      -- new.is_urgent is the client's own call — left as they set it.
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
    if coalesce(old.created_by <> v_uid, true) or old.status <> 'new' then
      raise exception 'You can only edit your own tickets while they are still open';
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
      if new.is_urgent is distinct from old.is_urgent then
        raise exception 'Only managers and admins can mark tickets urgent';
      end if;
    end if;

  elsif v_role = 'team_lead' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id);
    if not v_in_scope and not v_is_claim then
      raise exception 'This ticket is outside your scope — you can only claim it if it is urgent and unassigned';
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign tickets to this person';
    end if;
    new.assigned_by := v_uid;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  if new.ecommerce_account_id is not null and not exists (
    select 1 from ecommerce_accounts ea
    where ea.id = new.ecommerce_account_id and ea.client_id = new.client_id
  ) then
    raise exception 'That e-commerce account does not belong to this client';
  end if;

  return new;
end $$;

create or replace function public.reopen_ticket(p_ticket_id uuid, p_feedback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   app_role := auth_role();
  v_uid    uuid := auth.uid();
  v_client uuid;
  v_status ticket_status;
begin
  select client_id, status into v_client, v_status from tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_status <> 'resolved' then
    raise exception 'Only a resolved ticket can be reopened';
  end if;

  if v_role in ('super_admin', 'admin') then
    null; -- allowed
  elsif v_role = 'client' and v_client = my_client_id() then
    null; -- allowed — the client sending their own resolved ticket back
  else
    raise exception 'Only the client or an admin can reopen a resolved ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);

  -- Send the completed task(s) back for rework first — this re-fires the
  -- auto-progress trigger (047), which will try to drop the ticket to
  -- 'in_progress'. Writing 'reopened' below afterward is what sticks.
  update tasks set status = 'changes_requested' where ticket_id = p_ticket_id and status = 'completed';

  update tickets set status = 'reopened' where id = p_ticket_id;

  if p_feedback is not null and length(trim(p_feedback)) > 0 then
    insert into ticket_comments (ticket_id, author_id, body, is_internal)
    values (p_ticket_id, v_uid, p_feedback, false);
  end if;
end $$;

revoke execute on function public.reopen_ticket(uuid, text) from anon, public;
grant  execute on function public.reopen_ticket(uuid, text) to authenticated;
