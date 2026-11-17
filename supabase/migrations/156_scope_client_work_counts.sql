-- Limit the client-list workload summary to the client page currently being shown.
-- Keeping this security invoker preserves task and ticket row-level visibility.
create index if not exists tasks_open_client_counts_idx
  on public.tasks (client_id) where status not in ('completed', 'cancelled');
create index if not exists tickets_open_client_counts_idx
  on public.tickets (client_id) where status <> 'closed';
create index if not exists clients_pending_created_idx
  on public.clients (created_at, id) where status = 'pending';
create index if not exists agreement_acceptances_client_idx
  on public.agreement_acceptances (client_id);

create or replace function public.client_open_work_counts_for(p_client_ids uuid[])
returns table (
  client_id uuid,
  open_task_count bigint,
  open_ticket_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with requested_clients as (
    select distinct requested.client_id as id
    from unnest(coalesce(p_client_ids, '{}'::uuid[])) as requested(client_id)
    where requested.client_id is not null
  ),
  task_counts as (
    select t.client_id, count(*)::bigint as open_task_count
    from public.tasks t
    join requested_clients rc on rc.id = t.client_id
    where t.status not in ('completed', 'cancelled')
    group by t.client_id
  ),
  ticket_counts as (
    select tk.client_id, count(*)::bigint as open_ticket_count
    from public.tickets tk
    join requested_clients rc on rc.id = tk.client_id
    where tk.status <> 'closed'
    group by tk.client_id
  )
  select
    rc.id,
    coalesce(tc.open_task_count, 0),
    coalesce(kc.open_ticket_count, 0)
  from requested_clients rc
  left join task_counts tc on tc.client_id = rc.id
  left join ticket_counts kc on kc.client_id = rc.id
$$;

revoke all on function public.client_open_work_counts_for(uuid[]) from public, anon;
grant execute on function public.client_open_work_counts_for(uuid[]) to authenticated;
