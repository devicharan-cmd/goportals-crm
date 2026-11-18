-- Support the staff dashboard's active-task and completed-task filters/sorts.
-- These partial indexes keep the dashboard counts and first visible rows from
-- scanning terminal tasks that are not part of the active-work panels.
create index if not exists tasks_dashboard_open_order_idx
  on public.tasks (
    is_urgent desc,
    due_date asc nulls last,
    created_at desc
  )
  where status not in ('completed', 'cancelled');

-- The personal dashboard cards sort by due date; the due-today query then
-- continues through the same index's priority and created_at keys.
create index if not exists tasks_dashboard_assignee_due_idx
  on public.tasks (
    assignee_id,
    due_date asc nulls first,
    priority,
    created_at desc
  )
  where status not in ('completed', 'cancelled');

create index if not exists tasks_dashboard_urgent_unassigned_idx
  on public.tasks (priority, created_at)
  where is_urgent
    and assignee_id is null
    and status not in ('completed', 'cancelled');

create index if not exists tasks_dashboard_completed_idx
  on public.tasks (closed_at desc nulls last)
  where status = 'completed';
