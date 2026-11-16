create index if not exists tasks_created_at_summary_idx on public.tasks (created_at);
create index if not exists tasks_closed_at_summary_idx on public.tasks (closed_at) where closed_at is not null;
create index if not exists tickets_created_at_summary_idx on public.tickets (created_at);
create index if not exists tickets_closed_at_summary_idx on public.tickets (closed_at) where closed_at is not null;
create index if not exists time_logs_logged_date_summary_idx on public.time_logs (logged_date);
create index if not exists tickets_status_created_id_page_idx
  on public.tickets (status, created_at desc, id asc);
create index if not exists tickets_client_created_id_page_idx
  on public.tickets (client_id, created_at desc, id asc);

create or replace function public.client_open_work_counts()
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
  with task_counts as (
    select t.client_id, count(*)::bigint as open_task_count
    from public.tasks t
    where t.status not in ('completed', 'cancelled')
    group by t.client_id
  ),
  ticket_counts as (
    select tk.client_id, count(*)::bigint as open_ticket_count
    from public.tickets tk
    where tk.status <> 'closed'
    group by tk.client_id
  )
  select
    coalesce(tc.client_id, kc.client_id),
    coalesce(tc.open_task_count, 0),
    coalesce(kc.open_ticket_count, 0)
  from task_counts tc
  full outer join ticket_counts kc on kc.client_id = tc.client_id
$$;

create or replace function public.team_task_summary(p_month_start timestamptz, p_today date)
returns table (
  profile_id uuid,
  open_task_count bigint,
  open_estimated_hours numeric,
  overdue_task_count bigint,
  completed_this_month bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    t.assignee_id,
    count(*) filter (where t.status not in ('completed', 'cancelled'))::bigint,
    coalesce(sum(coalesce(t.estimated_hours, 3)) filter (where t.status not in ('completed', 'cancelled')), 0),
    count(*) filter (
      where t.status not in ('completed', 'cancelled')
        and t.due_date < p_today
    )::bigint,
    count(*) filter (
      where t.status = 'completed'
        and t.closed_at >= p_month_start
    )::bigint
  from public.tasks t
  where t.assignee_id is not null
    and (
      t.status not in ('completed', 'cancelled')
      or (t.status = 'completed' and t.closed_at >= p_month_start)
    )
  group by t.assignee_id
$$;

create or replace function public.monthly_report_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_log_from date,
  p_log_to date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with month_tasks as (
    select t.id, t.client_id, t.assignee_id, t.due_date, t.created_at, t.closed_at
    from public.tasks t
    where (t.created_at >= p_from and t.created_at <= p_to)
       or (t.closed_at >= p_from and t.closed_at <= p_to)
  ),
  month_tickets as (
    select tk.id, tk.client_id, tk.created_at, tk.closed_at
    from public.tickets tk
    where (tk.created_at >= p_from and tk.created_at <= p_to)
       or (tk.closed_at >= p_from and tk.closed_at <= p_to)
  ),
  month_logs as (
    select l.profile_id, l.hours
    from public.time_logs l
    where l.logged_date >= p_log_from and l.logged_date <= p_log_to
  ),
  task_metrics as (
    select
      count(*) filter (where t.created_at >= p_from and t.created_at <= p_to) as tasks_created,
      count(*) filter (where t.closed_at >= p_from and t.closed_at <= p_to) as tasks_completed,
      count(*) filter (
        where t.closed_at >= p_from and t.closed_at <= p_to
          and t.due_date is not null
          and (t.closed_at at time zone 'Asia/Kolkata')::date > t.due_date
      ) as tasks_completed_late
    from month_tasks t
  ),
  ticket_metrics as (
    select
      count(*) filter (where t.created_at >= p_from and t.created_at <= p_to) as tickets_raised,
      count(*) filter (where t.closed_at >= p_from and t.closed_at <= p_to) as tickets_closed
    from month_tickets t
  ),
  log_metrics as (
    select coalesce(sum(l.hours), 0) as hours_logged
    from month_logs l
  ),
  task_people as (
    select
      t.assignee_id as profile_id,
      count(*) filter (where t.closed_at >= p_from and t.closed_at <= p_to) as done,
      count(*) filter (
        where t.closed_at >= p_from and t.closed_at <= p_to
          and t.due_date is not null
          and (t.closed_at at time zone 'Asia/Kolkata')::date > t.due_date
      ) as late
    from month_tasks t
    where t.assignee_id is not null
    group by t.assignee_id
  ),
  log_people as (
    select l.profile_id, sum(l.hours) as hours
    from month_logs l
    where l.profile_id is not null
    group by l.profile_id
  ),
  activity_people as (
    select
      coalesce(tp.profile_id, lp.profile_id) as profile_id,
      coalesce(tp.done, 0) as done,
      coalesce(tp.late, 0) as late,
      coalesce(lp.hours, 0) as hours
    from task_people tp
    full outer join log_people lp on lp.profile_id = tp.profile_id
  ),
  people_summary as (
    select
      p.id as profile_id,
      coalesce(ap.done, 0) as done,
      coalesce(ap.late, 0) as late,
      coalesce(ap.hours, 0) as hours
    from public.profiles p
    left join activity_people ap on ap.profile_id = p.id
    where p.role <> 'client'
  ),
  task_clients as (
    select
      t.client_id,
      max(c.company_name) as company_name,
      count(*) filter (where t.created_at >= p_from and t.created_at <= p_to) as created,
      count(*) filter (where t.closed_at >= p_from and t.closed_at <= p_to) as done,
      0::bigint as tickets
    from month_tasks t
    left join public.clients c on c.id = t.client_id
    group by t.client_id
  ),
  ticket_clients as (
    select
      t.client_id,
      max(c.company_name) as company_name,
      0::bigint as created,
      0::bigint as done,
      count(*) filter (where t.created_at >= p_from and t.created_at <= p_to) as tickets
    from month_tickets t
    left join public.clients c on c.id = t.client_id
    group by t.client_id
  ),
  client_summary as (
    select
      c.client_id,
      max(c.company_name) as company_name,
      sum(c.created) as created,
      sum(c.done) as done,
      sum(c.tickets) as tickets
    from (
      select * from task_clients
      union all
      select * from ticket_clients
    ) c
    group by c.client_id
  )
  select jsonb_build_object(
    'tickets_raised', (select tm.tickets_raised from ticket_metrics tm),
    'tickets_closed', (select tm.tickets_closed from ticket_metrics tm),
    'hours_logged', (select lm.hours_logged from log_metrics lm),
    'tasks_created', (select tm.tasks_created from task_metrics tm),
    'tasks_completed', (select tm.tasks_completed from task_metrics tm),
    'tasks_completed_late', (select tm.tasks_completed_late from task_metrics tm),
    'by_person', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', ps.profile_id,
        'done', ps.done,
        'late', ps.late,
        'hours', ps.hours
      ))
      from people_summary ps
    ), '[]'::jsonb),
    'by_client', coalesce((
      select jsonb_agg(jsonb_build_object(
        'client_id', cs.client_id,
        'company_name', cs.company_name,
        'created', cs.created,
        'done', cs.done,
        'tickets', cs.tickets
      ))
      from client_summary cs
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.client_open_work_counts() from public, anon;
revoke all on function public.team_task_summary(timestamptz, date) from public, anon;
revoke all on function public.monthly_report_summary(timestamptz, timestamptz, date, date) from public, anon;
grant execute on function public.client_open_work_counts() to authenticated;
grant execute on function public.team_task_summary(timestamptz, date) to authenticated;
grant execute on function public.monthly_report_summary(timestamptz, timestamptz, date, date) to authenticated;
