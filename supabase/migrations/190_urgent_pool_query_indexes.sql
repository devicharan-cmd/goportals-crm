-- Match the urgent pool's live status filters and stable ID pagination.
create index if not exists tasks_urgent_pool_idx
  on public.tasks (id)
  where is_urgent and status not in ('completed', 'cancelled');

create index if not exists tickets_urgent_pool_idx
  on public.tickets (id)
  where is_urgent and status <> 'closed';
