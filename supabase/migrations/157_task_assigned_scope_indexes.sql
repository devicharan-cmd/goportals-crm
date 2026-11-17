-- Support the task list's "Assigned by me" filter and its exact count query.
-- Null assignments cannot match that scope's assignee_id filter.
create index if not exists tasks_assigned_scope_idx
  on public.tasks (assigned_by, assignee_id)
  where assigned_by is not null and assignee_id is not null;

-- The task history RPC only reads reassignment events for each requested task.
create index if not exists task_activity_assignee_history_by_task_idx
  on public.task_activity (task_id, created_at desc)
  where action = 'assignee_changed';
