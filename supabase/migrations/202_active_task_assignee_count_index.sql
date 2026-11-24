-- Support active "My tasks" counts with a small, count-focused partial index.
-- Keep terminal tasks out of the index because they never contribute to this
-- tab count.
create index if not exists tasks_active_assignee_idx
  on public.tasks (assignee_id)
  where status not in ('completed', 'cancelled');
