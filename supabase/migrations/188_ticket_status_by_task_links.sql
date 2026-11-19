-- Ticket status is driven only by linked task existence.
-- A ticket with no linked tasks is Unassigned; once any task is linked it is
-- Assigned. Task assignee/status changes do not affect the ticket status.
-- Closed remains an explicit, terminal ticket action.

alter table public.ticket_activity
  add column if not exists metadata jsonb;

create or replace function public.refresh_ticket_status_from_task_links(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.ticket_status;
  v_target public.ticket_status;
  v_previous_bypass text := current_setting('app.bypass_guard', true);
begin
  select status into v_current
    from public.tickets
   where id = p_ticket_id
   for update;
  if not found or v_current = 'closed' then
    return;
  end if;

  v_target := case
    when exists (select 1 from public.tasks where ticket_id = p_ticket_id)
      then 'assigned'::public.ticket_status
    else 'unassigned'::public.ticket_status
  end;

  if v_target is distinct from v_current then
    perform set_config('app.bypass_guard', 'on', true);
    update public.tickets
       set status = v_target
     where id = p_ticket_id;
    perform set_config('app.bypass_guard', coalesce(v_previous_bypass, ''), true);
  end if;
end
$$;

create or replace function public.sync_ticket_status_from_task_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_ticket_status_from_task_links(old.ticket_id);
  elsif tg_op = 'UPDATE' then
    if old.ticket_id is distinct from new.ticket_id then
      perform public.refresh_ticket_status_from_task_links(old.ticket_id);
    end if;
    perform public.refresh_ticket_status_from_task_links(new.ticket_id);
  else
    perform public.refresh_ticket_status_from_task_links(new.ticket_id);
  end if;
  return null;
end
$$;

drop trigger if exists tasks_sync_ticket_status_from_links on public.tasks;
create constraint trigger tasks_sync_ticket_status_from_links
  after insert or delete or update of ticket_id on public.tasks
  deferrable initially deferred
  for each row execute function public.sync_ticket_status_from_task_links();

-- Preserve a ticket-level audit row before task_activity is removed by the
-- task's ON DELETE CASCADE. This runs for both regular and scheduled-task RPCs.
create or replace function public.log_deleted_task_on_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_history jsonb;
begin
  if old.ticket_id is null then
    return old;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'actor_id', activity.actor_id,
        'old_value', activity.old_value,
        'new_value', activity.new_value,
        'created_at', activity.created_at
      ) order by activity.created_at, activity.id
    ),
    '[]'::jsonb
  )
  into v_assignment_history
  from public.task_activity activity
  where activity.task_id = old.id
    and activity.action = 'assignee_changed';

  insert into public.ticket_activity (
    ticket_id, actor_id, action, old_value, new_value, is_client_visible, metadata
  ) values (
    old.ticket_id,
    auth.uid(),
    'task_deleted',
    'GP-' || old.task_number,
    old.title,
    false,
    jsonb_build_object(
      'task_id', old.id,
      'task_number', old.task_number,
      'title', old.title,
      'assignee_id', old.assignee_id,
      'assigned_by', old.assigned_by,
      'created_by', old.created_by,
      'assignment_history', v_assignment_history
    )
  );
  return old;
end
$$;

drop trigger if exists tasks_log_deleted_task_on_ticket on public.tasks;
create trigger tasks_log_deleted_task_on_ticket
  before delete on public.tasks
  for each row execute function public.log_deleted_task_on_ticket();

-- Repair existing non-closed tickets whose status was left stale by the old
-- task-assignment/status synchronization.
do $$
declare
  v_previous_bypass text := current_setting('app.bypass_guard', true);
begin
  perform set_config('app.bypass_guard', 'on', true);
  alter table public.tickets disable trigger tickets_log_activity;
  update public.tickets ticket
     set status = case
       when exists (select 1 from public.tasks task where task.ticket_id = ticket.id)
         then 'assigned'::public.ticket_status
       else 'unassigned'::public.ticket_status
     end
   where ticket.status <> 'closed';
  alter table public.tickets enable trigger tickets_log_activity;
  perform set_config('app.bypass_guard', coalesce(v_previous_bypass, ''), true);
end
$$;

-- Prevent the old manual status RPC from bypassing the task-link rule. The
-- explicit close_ticket RPC remains the only supported way to close a ticket.
revoke all on function public.set_ticket_status(uuid, public.ticket_status) from public, anon, authenticated;

revoke all on function public.refresh_ticket_status_from_task_links(uuid) from public, anon, authenticated;
revoke all on function public.sync_ticket_status_from_task_links() from public, anon, authenticated;
revoke all on function public.log_deleted_task_on_ticket() from public, anon, authenticated;
