-- Performance-only indexes for the staff task list.
-- These do not change row visibility, ordering, statuses, or any business rule.

-- Matches the default /tasks?scope=all&view=list ordering.
create index if not exists tasks_staff_list_order_idx
  on public.tasks (is_urgent desc, due_date asc nulls last, created_at desc, id asc);

-- Supports the common assigned-by and date-filter paths without changing results.
create index if not exists tasks_assigned_by_idx
  on public.tasks (assigned_by);

create index if not exists tasks_assigned_at_idx
  on public.tasks (assigned_at);

create index if not exists tasks_due_date_idx
  on public.tasks (due_date);

notify pgrst, 'reload schema';
