-- Keep ticket list/detail queries index-friendly as the data set grows.
-- All indexes are additive and safe to re-run; no rows are changed.

create index if not exists tickets_status_created_id_idx
  on public.tickets (status, created_at desc, id asc);

create index if not exists tickets_assignee_status_created_idx
  on public.tickets (assignee_id, status, created_at desc, id asc);

create index if not exists tickets_assigned_by_status_created_idx
  on public.tickets (assigned_by, status, created_at desc, id asc);

create index if not exists ticket_activity_ticket_created_idx
  on public.ticket_activity (ticket_id, created_at desc, id desc);

create index if not exists task_comments_task_created_idx
  on public.task_comments (task_id, created_at asc, id asc);

create index if not exists task_attachments_comment_idx
  on public.task_attachments (comment_id)
  where comment_id is not null;

notify pgrst, 'reload schema';
