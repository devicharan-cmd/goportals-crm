-- Match the task list's default sort for the "My tasks" scope.
create index if not exists tasks_mine_list_order_idx
  on public.tasks (
    assignee_id,
    is_urgent desc,
    due_date asc nulls last,
    created_at desc,
    id asc
  );

-- Match the "Assigned by me" filters and ordering. The existing 157 index
-- only covered the filters, so replace it with the sort columns as well.
create index if not exists tasks_assigned_scope_order_idx
  on public.tasks (
    assigned_by,
    assignee_id,
    is_urgent desc,
    due_date asc nulls last,
    created_at desc,
    id asc
  )
  where assigned_by is not null and assignee_id is not null;

drop index if exists public.tasks_assignee_idx;
drop index if exists public.tasks_assigned_scope_idx;
