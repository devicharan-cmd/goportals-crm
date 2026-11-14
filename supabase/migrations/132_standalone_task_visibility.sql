-- Public standalone tasks can be shown to their client through a safe RPC.
-- Private tasks remain staff-only and cannot enter client-review statuses.
alter table public.tasks
  add column if not exists visibility text not null default 'public';

update public.tasks
   set visibility = 'public'
 where visibility is null
    or (ticket_id is not null and visibility <> 'public');

alter table public.tasks
  alter column visibility set default 'public',
  alter column visibility set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tasks'::regclass
       and conname = 'tasks_visibility_check'
  ) then
    alter table public.tasks
      add constraint tasks_visibility_check
      check (visibility in ('public', 'private'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tasks'::regclass
       and conname = 'tasks_ticket_visibility_check'
  ) then
    alter table public.tasks
      add constraint tasks_ticket_visibility_check
      check (ticket_id is null or visibility = 'public');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tasks'::regclass
       and conname = 'tasks_private_review_status_check'
  ) then
    alter table public.tasks
      add constraint tasks_private_review_status_check
      check (visibility <> 'private' or status not in ('client_review', 'changes_requested'));
  end if;
end
$$;

create or replace function public.guard_task_visibility_immutable()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visibility is distinct from old.visibility then
    raise exception 'Task visibility cannot be changed after creation';
  end if;
  return new;
end
$$;

drop trigger if exists guard_task_visibility_immutable on public.tasks;
create trigger guard_task_visibility_immutable
  before update on public.tasks
  for each row execute function public.guard_task_visibility_immutable();

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by)
    and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (
    task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status, assigned_by)
    and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
  )
  with check (
    auth_role() <> 'client' or (ticket_id is not null and visibility = 'public')
  );

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when auth_role() = 'client' then
        t.visibility = 'public'
        and t.client_id = my_client_id()
        and (t.ticket_id is null or can_see_ticket(t.ticket_id))
      else task_visible(
        t.client_id, t.department_id, t.assignee_id, t.created_by,
        t.is_urgent, t.status, t.assigned_by
      )
    end
    from public.tasks t
    where t.id = p_task_id
  ), false)
$$;

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
  ticket jsonb,
  visibility text
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
    end,
    t.visibility
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

create or replace function public.client_approve_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
  v_visibility text;
  v_ticket_status public.ticket_status;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'Only the client can approve a task';
  end if;

  select task.ticket_id, task.client_id, task.status, task.visibility, ticket.status
    into v_ticket_id, v_client_id, v_status, v_visibility, v_ticket_status
    from public.tasks task
    left join public.tickets ticket on ticket.id = task.ticket_id
   where task.id = p_task_id
   for update of task;

  if not found or v_visibility <> 'public' or v_client_id is distinct from my_client_id()
     or (v_ticket_id is not null and v_ticket_status is null)
     or (v_ticket_id is not null and not can_see_ticket(v_ticket_id)) then
    raise exception 'Task not found';
  end if;
  if v_status <> 'client_review' then
    raise exception 'Only a task in Client review can be approved';
  end if;
  if v_ticket_id is not null and v_ticket_status = 'closed' then
    raise exception 'This ticket is closed';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks set status = 'completed' where id = p_task_id;
end
$$;

create or replace function public.client_request_task_changes(
  p_task_id uuid,
  p_feedback text,
  p_attachments jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comment_id uuid;
  v_ticket_id uuid;
  v_client_id uuid;
  v_status public.task_status;
  v_visibility text;
  v_ticket_status public.ticket_status;
  v_attachment jsonb;
  v_path text;
  v_prefix text;
  v_file_name text;
  v_size bigint;
begin
  if auth_role() is distinct from 'client' then
    raise exception 'Only the client can request task changes';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'Attachments must be a list';
  end if;
  if p_feedback is null or length(trim(p_feedback)) = 0 or length(trim(p_feedback)) > 4000 then
    raise exception 'Feedback must be between 1 and 4000 characters';
  end if;

  select task.ticket_id, task.client_id, task.status, task.visibility, ticket.status
    into v_ticket_id, v_client_id, v_status, v_visibility, v_ticket_status
    from public.tasks task
    left join public.tickets ticket on ticket.id = task.ticket_id
   where task.id = p_task_id
   for update of task;

  if not found or v_visibility <> 'public' or v_client_id is distinct from my_client_id()
     or (v_ticket_id is not null and v_ticket_status is null)
     or (v_ticket_id is not null and not can_see_ticket(v_ticket_id)) then
    raise exception 'Task not found';
  end if;
  if v_status not in ('client_review', 'completed') then
    raise exception 'Changes can only be requested while a task is in Client review or completed';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  if v_ticket_id is not null and v_ticket_status = 'closed' then
    update public.tickets set status = 'assigned' where id = v_ticket_id;
  end if;
  update public.tasks set status = 'changes_requested' where id = p_task_id;

  insert into public.task_comments (task_id, author_id, body, is_internal)
  values (p_task_id, v_uid, trim(p_feedback), false)
  returning id into v_comment_id;

  v_prefix := p_task_id::text || '/chat/' || v_uid::text || '/';
  for v_attachment in
    select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_path := nullif(v_attachment->>'storage_path', '');
    v_file_name := nullif(trim(v_attachment->>'file_name'), '');
    v_size := nullif(v_attachment->>'size_bytes', '')::bigint;
    if v_path is null or left(v_path, length(v_prefix)) <> v_prefix or v_file_name is null or v_size < 0 then
      raise exception 'Invalid task attachment details';
    end if;
    insert into public.task_attachments (
      task_id, comment_id, uploaded_by, storage_path, file_name, mime_type, size_bytes
    ) values (
      p_task_id, v_comment_id, v_uid, v_path, v_file_name,
      nullif(v_attachment->>'mime_type', ''), v_size
    );
  end loop;

  return v_comment_id;
end
$$;

revoke execute on function public.client_approve_task(uuid) from anon, public;
grant execute on function public.client_approve_task(uuid) to authenticated;
revoke execute on function public.client_request_task_changes(uuid, text, jsonb) from anon, public;
grant execute on function public.client_request_task_changes(uuid, text, jsonb) to authenticated;
