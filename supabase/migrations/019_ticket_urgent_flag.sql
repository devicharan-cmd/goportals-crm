-- ============================================================
-- 019: Tickets get an urgent flag the CLIENT sets themselves (unlike tasks,
--   where only managers/admins can mark something urgent — a ticket's urgency
--   is the client's own signal about their own request, so it stays theirs
--   to set and to change, same as subject/description/priority already are).
--   Urgent + unassigned tickets become claimable by any staff member, mirroring
--   the existing task urgent pool (claim_task / /urgent).
-- Safe to re-run.
-- ============================================================

alter table tickets add column if not exists is_urgent boolean not null default false;
create index if not exists tickets_urgent_idx on tickets (created_at) where is_urgent and status <> 'done';

-- ─── Visibility: urgent + unassigned tickets are visible to all staff ────
create or replace function public.ticket_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid, p_created_by uuid,
  p_is_urgent boolean, p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'manager' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
      or is_employee(p_assignee_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'done')
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select ticket_visible(t.client_id, t.department_id, t.assignee_id, t.created_by, t.is_urgent, t.status)
    from tickets t where t.id = p_ticket_id
  ), false)
$$;

drop policy if exists tickets_select on tickets;
create policy tickets_select on tickets for select to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status));

drop policy if exists tickets_update on tickets;
create policy tickets_update on tickets for update to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status))
  with check (true);  -- column-level rules enforced by guard_ticket_write

-- ─── Permissions: client sets/changes is_urgent themselves; staff need to be
--   a manager/admin to mark one urgent, and an unassigned urgent ticket can be
--   claimed by anyone (mirrors guard_task_write's v_is_claim). ────────────
create or replace function public.guard_ticket_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role     app_role := auth_role();
  v_uid      uuid     := auth.uid();
  v_is_claim boolean;
  v_in_scope boolean;
begin
  if v_uid is null then
    if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
      new.assigned_at := case when new.assignee_id is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role is null then
    raise exception 'Your account is not active yet';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    if v_role = 'client' then
      new.client_id     := my_client_id();
      new.status        := 'open';
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
            and old.status <> 'done'
            and coalesce(new.assignee_id = v_uid, false)
            and only_changed(to_jsonb(old), to_jsonb(new),
                             array['assignee_id', 'assigned_by', 'assigned_at', 'updated_at']);

  if v_role = 'client' then
    if coalesce(old.created_by <> v_uid, true) or old.status <> 'open' then
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

  elsif v_role = 'manager' then
    v_in_scope := coalesce(old.assignee_id = v_uid, false)
               or coalesce(old.created_by = v_uid, false)
               or (old.department_id is not null and manages_department(old.department_id))
               or manager_covers_client(old.client_id)
               or is_employee(old.assignee_id);
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

-- ─── Claim an urgent, unassigned ticket (first one wins) ─────
create or replace function public.claim_ticket(p_ticket_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  update tickets set assignee_id = auth.uid()
  where id = p_ticket_id and assignee_id is null and is_urgent and status <> 'done';
  if not found then
    raise exception 'This ticket was already claimed or is no longer urgent';
  end if;
end $$;

revoke execute on function public.claim_ticket(uuid) from anon, public;
grant  execute on function public.claim_ticket(uuid) to authenticated;
