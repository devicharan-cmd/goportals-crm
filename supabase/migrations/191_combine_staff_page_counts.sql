-- Return the task and ticket tab counts with one RLS-respecting scan per page.
-- Both functions run as the authenticated caller, so existing table policies
-- continue to define exactly which rows contribute to the counts.

-- Match the reassignment-history lookup used by the task visibility policy.
create index if not exists task_activity_reassignment_actor_idx
  on public.task_activity (task_id, actor_id)
  where action = 'assignee_changed';

create or replace function public.staff_task_scope_counts()
returns table (mine_active_count bigint, all_visible_count bigint)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (
      where task.assignee_id = auth.uid()
        and task.status not in ('completed', 'cancelled')
    ),
    count(*)
  from public.tasks task;
$$;

revoke all on function public.staff_task_scope_counts() from public, anon;
grant execute on function public.staff_task_scope_counts() to authenticated;

create or replace function public.staff_ticket_status_counts()
returns table (unassigned_count bigint, assigned_count bigint, closed_count bigint)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where ticket.status = 'unassigned'),
    count(*) filter (where ticket.status = 'assigned'),
    count(*) filter (where ticket.status = 'closed')
  from public.tickets ticket;
$$;

revoke all on function public.staff_ticket_status_counts() from public, anon;
grant execute on function public.staff_ticket_status_counts() to authenticated;

create or replace function public.staff_dashboard_counts(p_today date)
returns table (
  my_open_count bigint,
  due_today_count bigint,
  urgent_waiting_count bigint,
  unassigned_ticket_count bigint,
  pending_client_count bigint,
  working_count bigint,
  done_count bigint
)
language sql
stable
set search_path = public
as $$
  with task_counts as (
    select
      count(*) filter (
        where task.assignee_id = auth.uid()
          and task.status not in ('completed', 'cancelled')
      ) as my_open_count,
      count(*) filter (
        where task.assignee_id = auth.uid()
          and task.status not in ('completed', 'cancelled')
          and task.due_date = p_today
      ) as due_today_count,
      count(*) filter (
        where task.is_urgent
          and task.assignee_id is null
          and task.status not in ('completed', 'cancelled')
      ) as urgent_waiting_count,
      count(*) filter (
        where task.status not in ('completed', 'cancelled')
      ) as working_count,
      count(*) filter (where task.status = 'completed') as done_count
    from public.tasks task
  ),
  ticket_counts as (
    select count(*) as unassigned_ticket_count
    from public.tickets ticket
    where ticket.status = 'unassigned'
  ),
  client_counts as (
    select count(*) as pending_client_count
    from public.clients client
    where client.status = 'pending'
  )
  select
    task_counts.my_open_count,
    task_counts.due_today_count,
    task_counts.urgent_waiting_count,
    ticket_counts.unassigned_ticket_count,
    client_counts.pending_client_count,
    task_counts.working_count,
    task_counts.done_count
  from task_counts
  cross join ticket_counts
  cross join client_counts;
$$;

revoke all on function public.staff_dashboard_counts(date) from public, anon;
grant execute on function public.staff_dashboard_counts(date) to authenticated;

-- The shared app shell previously fetched unread notifications, urgent task
-- and ticket totals, and pending clients through separate PostgREST requests.
-- Return only the counters requested by the caller in one RLS-respecting RPC.
create or replace function public.staff_shell_counts(
  p_include_notifications boolean default true,
  p_include_urgent boolean default true,
  p_include_approvals boolean default true
)
returns table (
  unread_notifications_count bigint,
  urgent_count bigint,
  pending_clients_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    case when p_include_notifications then (
      select count(*)
      from public.notifications notification
      where notification.recipient_id = auth.uid()
        and notification.is_read = false
    ) else 0 end,
    case when p_include_urgent and auth_role()::text <> 'client' then (
      (select count(*)
       from public.tasks task
       where task.is_urgent
         and task.assignee_id is null
         and task.status not in ('completed', 'cancelled'))
      +
      case when auth_role()::text in ('super_admin', 'manager', 'team_lead') then (
        select count(*)
        from public.tickets ticket
        where ticket.is_urgent
          and ticket.status = 'unassigned'
      ) else 0 end
    ) else 0 end,
    case when p_include_approvals and auth_role()::text = 'super_admin' then (
      select count(*)
      from public.clients client
      where client.status = 'pending'
    ) else 0 end;
$$;

revoke all on function public.staff_shell_counts(boolean, boolean, boolean) from public, anon;
grant execute on function public.staff_shell_counts(boolean, boolean, boolean) to authenticated;

-- Supports the task assignment alert's unread, typed, task-linked feed.
create index if not exists notifications_task_alert_idx
  on public.notifications (recipient_id, created_at desc)
  where not is_read
    and task_id is not null
    and type in ('assigned', 'scheduled_assignment', 'client_task_approved', 'client_task_changes_requested');

notify pgrst, 'reload schema';
