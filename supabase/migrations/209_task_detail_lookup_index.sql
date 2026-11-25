-- Keep the task detail page's reassignment-note lookup indexed as the table grows.
-- The page always filters this table by task_id; the primary key is activity_id.
create index if not exists task_assignment_notes_task_idx
  on public.task_assignment_notes (task_id);

notify pgrst, 'reload schema';
