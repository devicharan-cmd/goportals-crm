-- Multi-assignee task workflow. Each assignee gets a separate task row; the
-- two fields below only relate those rows and preserve their order.

begin;

alter table public.tasks
  add column if not exists task_group_id uuid,
  add column if not exists assignee_sequence integer;

alter table public.tasks drop constraint if exists tasks_assignee_sequence_positive;
alter table public.tasks
  add constraint tasks_assignee_sequence_positive
  check (assignee_sequence is null or assignee_sequence > 0);

create index if not exists tasks_task_group_sequence_idx
  on public.tasks (task_group_id, assignee_sequence)
  where task_group_id is not null;

-- Visibility is derived from the existing status and sequence. A change
-- request takes priority; otherwise the first non-terminal copy is active,
-- with the final copy remaining visible after the whole sequence completes.
create or replace function public.task_workflow_visible(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with current_task as (
    select id, task_group_id
    from public.tasks
    where id = p_task_id
  ),
  active_task as (
    select case
      when exists (
        select 1
        from public.tasks requested
        join current_task c on c.task_group_id = requested.task_group_id
        where requested.status = 'changes_requested'
      ) then (
        select requested.id
        from public.tasks requested
        join current_task c on c.task_group_id = requested.task_group_id
        where requested.status = 'changes_requested'
        order by requested.assignee_sequence desc nulls last
        limit 1
      )
      else coalesce(
        (
          select candidate.id
          from public.tasks candidate
          join current_task c on c.task_group_id = candidate.task_group_id
          where candidate.status not in ('completed', 'cancelled')
          order by candidate.assignee_sequence
          limit 1
        ),
        (
          select candidate.id
          from public.tasks candidate
          join current_task c on c.task_group_id = candidate.task_group_id
          order by candidate.assignee_sequence desc nulls last
          limit 1
        )
      )
    end as id
  )
  select case when c.task_group_id is null then true else a.id = c.id end
  from current_task c
  left join active_task a on true;
$$;

revoke all on function public.task_workflow_visible(uuid) from public, anon;
grant execute on function public.task_workflow_visible(uuid) to authenticated;

-- Create all copies atomically. Existing single-assignee creation remains
-- unchanged and leaves both workflow fields null.
create or replace function public.create_task_with_assignees(
  p_task_payload jsonb,
  p_assignee_ids uuid[]
) returns table (task_id uuid, task_group_id uuid, assignee_sequence integer)
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := case when coalesce(array_length(p_assignee_ids, 1), 0) > 1 then gen_random_uuid() else null end;
  v_id uuid;
  v_index integer;
begin
  if auth.uid() is null or auth_role() = 'client' then
    raise exception 'Only staff can create staff tasks';
  end if;
  if coalesce(array_length(p_assignee_ids, 1), 0) < 2 then
    raise exception 'At least two assignees are required for a multi-assignee task';
  end if;
  if cardinality(p_assignee_ids) <> (select count(distinct id)::integer from unnest(p_assignee_ids) as ids(id)) then
    raise exception 'Each assignee may be selected only once';
  end if;

  for v_index in 1..array_length(p_assignee_ids, 1) loop
    if not public.can_assign_task(p_assignee_ids[v_index]) then
      raise exception 'You cannot assign tasks to this person';
    end if;
    v_id := gen_random_uuid();
    insert into public.tasks (
      id, client_id, ticket_id, title, description, type, status, priority,
      is_urgent, source, visibility, department_id, platform_id, platform_ids,
      service_id, due_date, due_at, deadline_type, estimated_hours,
      assignee_id, task_group_id, assignee_sequence
    )
    values (
      v_id,
      nullif(p_task_payload->>'client_id', '')::uuid,
      nullif(p_task_payload->>'ticket_id', '')::uuid,
      p_task_payload->>'title',
      p_task_payload->>'description',
      coalesce(nullif(p_task_payload->>'type', ''), 'task')::public.task_type,
      coalesce(nullif(p_task_payload->>'status', ''), 'todo')::public.task_status,
      coalesce(nullif(p_task_payload->>'priority', ''), 'P3')::public.task_priority,
      coalesce((p_task_payload->>'is_urgent')::boolean, false),
      coalesce(nullif(p_task_payload->>'source', ''), 'internal')::public.task_source,
      coalesce(nullif(p_task_payload->>'visibility', ''), 'private'),
      nullif(p_task_payload->>'department_id', '')::uuid,
      nullif(p_task_payload->>'platform_id', '')::uuid,
      coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(coalesce(p_task_payload->'platform_ids', '[]'::jsonb)) values(value)), '{}'::uuid[]),
      nullif(p_task_payload->>'service_id', '')::uuid,
      nullif(p_task_payload->>'due_date', '')::date,
      nullif(p_task_payload->>'due_at', '')::timestamptz,
      nullif(p_task_payload->>'deadline_type', '')::public.deadline_type,
      nullif(p_task_payload->>'estimated_hours', '')::numeric,
      p_assignee_ids[v_index], v_group, v_index
    );
    task_id := v_id;
    task_group_id := v_group;
    assignee_sequence := v_index;
    return next;
  end loop;
end
$$;

revoke all on function public.create_task_with_assignees(jsonb, uuid[]) from public, anon;
grant execute on function public.create_task_with_assignees(jsonb, uuid[]) to authenticated;

-- Workflow metadata and assignees are immutable after creation.
create or replace function public.guard_task_workflow_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.bypass_guard', true) = 'on' then return new; end if;
  if new.task_group_id is distinct from old.task_group_id
     or new.assignee_sequence is distinct from old.assignee_sequence then
    raise exception 'Multi-assignee workflow fields cannot be changed after task creation';
  end if;
  if old.task_group_id is not null and new.assignee_id is distinct from old.assignee_id then
    raise exception 'Assignees in a multi-assignee workflow cannot be changed';
  end if;
  return new;
end
$$;

drop trigger if exists guard_task_workflow_fields on public.tasks;
create trigger guard_task_workflow_fields
  before update on public.tasks
  for each row execute function public.guard_task_workflow_fields();

-- Returning to a previous assignee starts the next copy from Todo. The old
-- status remains in activity history and the requesting row remains stored.
create or replace function public.sync_multi_assignee_task_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_next uuid;
  v_next_assignee uuid;
  v_next_number bigint;
  v_next_title text;
  v_next_client uuid;
begin
  if new.task_group_id is null or new.status is not distinct from old.status or new.status <> 'completed' then
    return new;
  end if;
  select id, assignee_id, task_number, title, client_id
    into v_next, v_next_assignee, v_next_number, v_next_title, v_next_client
  from public.tasks
  where task_group_id = new.task_group_id and assignee_sequence > new.assignee_sequence
  order by assignee_sequence limit 1;
  if v_next is not null then
    perform set_config('app.bypass_guard', 'on', true);
    update public.tasks set status = 'todo', updated_at = now()
    where id = v_next and status is distinct from 'todo';
    perform set_config('app.bypass_guard', 'off', true);
    if v_next_assignee is not null and v_next_assignee is distinct from auth.uid() then
      insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
      values (v_next_assignee, 'assigned',
        'GP-' || v_next_number || ': Task assigned to you',
        v_next_title, v_next, v_next_client);
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists sync_multi_assignee_task_completion on public.tasks;
create trigger sync_multi_assignee_task_completion
  after update of status on public.tasks
  for each row execute function public.sync_multi_assignee_task_completion();

-- Internal request-change handoff. The requester remains stored with its
-- current status; changing the previous copy to changes_requested makes that
-- copy the active one through task_workflow_visible().
create or replace function public.request_multi_assignee_task_changes(
  p_task_id uuid,
  p_feedback text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_previous public.tasks%rowtype;
  v_name text;
begin
  if v_uid is null or auth_role() = 'client' then
    raise exception 'Only staff can request internal task changes';
  end if;
  select * into v_task from public.tasks
  where id = p_task_id and task_group_id is not null and assignee_id = v_uid;
  if v_task.id is null or not public.task_workflow_visible(v_task.id) then
    raise exception 'You can only request changes on your active workflow task';
  end if;
  select * into v_previous from public.tasks
  where task_group_id = v_task.task_group_id
    and assignee_sequence = v_task.assignee_sequence - 1;
  if v_previous.id is null then raise exception 'The first assignee cannot request changes backward'; end if;

  select coalesce(nullif(full_name, ''), email) into v_name
  from public.profiles where id = v_uid;
  perform set_config('app.bypass_guard', 'on', true);
  update public.tasks set status = 'changes_requested', updated_at = now() where id = v_previous.id;
  insert into public.task_activity (task_id, actor_id, action, old_value, new_value, is_client_visible)
  values (v_previous.id, v_uid, 'internal_change_requested', 'completed',
          jsonb_build_object('requester_task_id', v_task.id, 'requester_id', v_uid,
            'previous_assignee_id', v_previous.assignee_id)::text, false);
  if v_previous.assignee_id is not null and v_previous.assignee_id is distinct from v_uid then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (v_previous.assignee_id, 'task_change_requested',
      'GP-' || v_previous.task_number || ': Changes requested by ' || coalesce(v_name, 'a team member'),
      coalesce(nullif(trim(p_feedback), ''), 'The next assignee requested changes and returned this task to you.'),
      v_previous.id, v_previous.client_id);
  end if;
  perform set_config('app.bypass_guard', 'off', true);
end
$$;

revoke all on function public.request_multi_assignee_task_changes(uuid, text) from public, anon;
grant execute on function public.request_multi_assignee_task_changes(uuid, text) to authenticated;

-- Do not notify later assignees at initial creation; they are notified when
-- their copy becomes active after the preceding copy is completed.
create or replace function public.notify_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' and new.source = 'client' then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    select p.id, 'client_task',
           'GP-' || new.task_number || ': New request from ' || (select company_name from public.clients where id = new.client_id),
           new.title, new.id, new.client_id
    from public.profiles p
    where p.status = 'active'
      and (p.role in ('super_admin', 'admin')
           or (p.role = 'team_lead' and new.department_id is not null
               and exists (select 1 from public.department_members dm
                           where dm.profile_id = p.id and dm.department_id = new.department_id
                             and dm.is_lead)));
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not (tg_op = 'INSERT' and coalesce(new.is_scheduled, false))
     and (new.task_group_id is null or new.assignee_sequence = 1) then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.assignee_id, 'assigned',
            'GP-' || new.task_number || ': Task assigned to you', new.title, new.id, new.client_id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.created_by is not null and new.created_by is distinct from v_uid then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.created_by, 'status_changed',
            'GP-' || new.task_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.title, new.id, new.client_id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.assignee_id is not null
     and new.assignee_id is distinct from v_uid
     and new.assignee_id is distinct from new.created_by then
    insert into public.notifications (recipient_id, type, title, body, task_id, client_id)
    values (new.assignee_id, 'status_changed',
            'GP-' || new.task_number || ': Moved to ' || replace(new.status::text, '_', ' '), new.title, new.id, new.client_id);
  end if;

  return null;
end
$$;

-- Update task visibility policies without changing the existing role rules.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (
  public.task_workflow_visible(id)
  and (auth_role() = 'super_admin' or (
    public.can_see_task_row(id, ticket_id, client_id, department_id, assignee_id,
      created_by, assigned_by, is_urgent, status, visibility)
    and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
  ))
);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using (
  public.task_workflow_visible(id)
  and (auth_role() = 'super_admin' or public.can_see_task_row(
    id, ticket_id, client_id, department_id, assignee_id, created_by,
    assigned_by, is_urgent, status, visibility
  ))
) with check (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'));

-- Existing activity/comment/file policies call can_see_task(), so include the
-- active-copy check in the shared visibility function as well.
create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.task_workflow_visible(p_task_id) and coalesce((
    select case
      when auth_role() = 'client' then
        t.visibility = 'public'
        and t.client_id = my_client_id()
        and (t.ticket_id is null or can_see_ticket(t.ticket_id))
      when auth_role() in ('manager', 'team_lead')
       and t.assignee_id is not null
       and exists (
         with recursive reports(id) as (
           select p.id from public.profiles p where p.reporting_to = auth.uid()
           union
           select child.id from public.profiles child
           join reports parent on child.reporting_to = parent.id
         )
         select 1 from reports where id = t.assignee_id
       ) then true
      when auth_role() in ('super_admin', 'manager', 'team_lead', 'employee')
       and (t.assignee_id = auth.uid() or t.assigned_by = auth.uid()) then true
      else public.task_visible(
        t.client_id, t.department_id, t.assignee_id, t.created_by,
        t.is_urgent, t.status, t.assigned_by
      )
    end
    from public.tasks t
    where t.id = p_task_id
  ), false)
$$;

-- Keep exact task-tab counts aligned with active workflow copies.
create or replace function public.staff_task_scope_counts()
returns table (mine_active_count bigint, assigned_by_me_count bigint, all_visible_count bigint)
language sql stable set search_path = public as $$
  select
    count(*) filter (where task.assignee_id = auth.uid() and task.status not in ('completed', 'cancelled')),
    count(*) filter (where task.assigned_by = auth.uid()),
    count(*)
  from public.tasks task
  where public.task_workflow_visible(task.id);
$$;

notify pgrst, 'reload schema';

commit;
