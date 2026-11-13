-- Client-visible ticket tasks should include the work description and service
-- details needed to understand what is being reviewed.
drop function if exists public.client_ticket_tasks(uuid, integer);

create function public.client_ticket_tasks(
  p_task_id uuid default null,
  p_task_number integer default null
) returns table (
  id uuid,
  task_number bigint,
  title text,
  description text,
  status public.task_status,
  priority public.task_priority,
  is_urgent boolean,
  source public.task_source,
  due_date date,
  assignee_id uuid,
  assigned_by uuid,
  client jsonb,
  platform jsonb,
  department jsonb,
  service jsonb,
  created_at timestamptz,
  ticket_id uuid,
  ticket jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() is distinct from 'client' then
    raise exception 'This view is only available to client accounts';
  end if;

  return query
  select
    t.id,
    t.task_number,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.is_urgent,
    t.source,
    t.due_date,
    t.assignee_id,
    t.assigned_by,
    jsonb_build_object('company_name', c.company_name),
    case when p.id is null then null else jsonb_build_object('name', p.name) end,
    case when d.id is null then null else jsonb_build_object('name', d.name) end,
    case when s.id is null then null else jsonb_build_object('name', s.name) end,
    t.created_at,
    t.ticket_id,
    case when k.id is null then null
         else jsonb_build_object('id', k.id, 'ticket_number', k.ticket_number, 'subject', k.subject)
    end
  from public.tasks t
  join public.clients c on c.id = t.client_id
  left join public.platforms p on p.id = t.platform_id
  left join public.departments d on d.id = t.department_id
  left join public.services s on s.id = t.service_id
  left join public.tickets k on k.id = t.ticket_id
  where t.ticket_id is not null
    and t.client_id = my_client_id()
    and can_see_ticket(t.ticket_id)
    and (p_task_id is null or t.id = p_task_id)
    and (p_task_number is null or t.task_number = p_task_number)
  order by t.created_at desc;
end
$$;

revoke execute on function public.client_ticket_tasks(uuid, integer) from anon, public;
grant execute on function public.client_ticket_tasks(uuid, integer) to authenticated;
