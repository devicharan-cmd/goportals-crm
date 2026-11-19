-- Store the actual end-of-day deadline as an absolute timestamp.
-- Task forms still select a calendar date; the database derives its deadline
-- as 23:59:59.999 Asia/Kolkata so every consumer uses the same instant.
alter table public.tasks
  add column if not exists due_at timestamptz;

update public.tasks
   set due_at = (due_date + time '23:59:59.999') at time zone 'Asia/Kolkata'
 where due_date is not null
   and due_at is distinct from (due_date + time '23:59:59.999') at time zone 'Asia/Kolkata';

update public.tasks
   set due_at = null
 where due_date is null and due_at is not null;

comment on column public.tasks.due_at is
  'Exact task deadline. A selected due_date is due at 23:59:59.999 Asia/Kolkata.';

create index if not exists tasks_due_at_idx
  on public.tasks (due_at) where due_at is not null;

create or replace function public.derive_task_due_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.due_at := case
    when new.due_date is null then null
    else (new.due_date + time '23:59:59.999') at time zone 'Asia/Kolkata'
  end;
  return new;
end
$$;

revoke all on function public.derive_task_due_at() from public, anon, authenticated;
drop trigger if exists tasks_derive_due_at on public.tasks;
create trigger tasks_derive_due_at
  before insert or update on public.tasks
  for each row execute function public.derive_task_due_at();

-- Team overdue counts now use the stored deadline instant.
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
        and t.due_at < now()
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

-- Include the stored deadline in the restricted client task RPC.
drop function if exists public.client_ticket_tasks(uuid, integer);
create function public.client_ticket_tasks(
  p_task_id uuid default null,
  p_task_number integer default null
) returns table (
  id uuid, task_number bigint, title text, description text, status public.task_status,
  priority public.task_priority, is_urgent boolean, source public.task_source,
  due_date date, due_at timestamptz, assignee_id uuid, assigned_by uuid,
  client jsonb, platform jsonb, department jsonb, service jsonb,
  created_at timestamptz, ticket_id uuid, ticket jsonb,
  visibility text, is_scheduled boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() is distinct from 'client' then
    raise exception 'This view is only available to client accounts';
  end if;
  return query
  select t.id, t.task_number, t.title, t.description, t.status, t.priority, t.is_urgent,
         t.source, t.due_date, t.due_at, t.assignee_id, t.assigned_by,
         jsonb_build_object('company_name', c.company_name),
         case when p.id is null then null else jsonb_build_object('name', p.name) end,
         case when d.id is null then null else jsonb_build_object('name', d.name) end,
         case when s.id is null then null else jsonb_build_object('name', s.name) end,
         t.created_at, t.ticket_id,
         case when k.id is null then null else jsonb_build_object('id', k.id, 'ticket_number', k.ticket_number, 'subject', k.subject) end,
         t.visibility, t.is_scheduled
    from public.tasks t
    join public.clients c on c.id = t.client_id
    left join public.platforms p on p.id = t.platform_id
    left join public.departments d on d.id = t.department_id
    left join public.services s on s.id = t.service_id
    left join public.tickets k on k.id = t.ticket_id
   where t.visibility = 'public'
     and t.client_id = my_client_id()
     and (t.ticket_id is null or can_see_ticket(t.ticket_id))
     and (p_task_id is null or t.id = p_task_id)
     and (p_task_number is null or t.task_number = p_task_number)
   order by t.created_at desc;
end
$$;
revoke execute on function public.client_ticket_tasks(uuid, integer) from anon, public;
grant execute on function public.client_ticket_tasks(uuid, integer) to authenticated;

-- Monthly completion reports measure lateness against the same deadline instant.
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
    select t.id, t.client_id, t.assignee_id, t.due_date, t.due_at, t.created_at, t.closed_at
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
          and t.due_at is not null and t.closed_at > t.due_at
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
          and t.due_at is not null and t.closed_at > t.due_at
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
