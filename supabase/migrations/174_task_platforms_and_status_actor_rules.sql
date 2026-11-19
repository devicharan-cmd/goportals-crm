-- Tasks can cover more than one marketplace. Keep platform_id as the first
-- selected marketplace for older clients and existing joins.
alter table public.tasks
  add column if not exists platform_ids uuid[];

update public.tasks
   set platform_ids = case when platform_id is null then '{}'::uuid[] else array[platform_id] end
 where platform_ids is null;

create or replace function public.sync_task_platform_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule_platform_ids uuid[];
  v_invalid_count integer;
begin
  if new.platform_ids is null then
    if new.schedule_id is not null then
      select array_agg(value::uuid order by ordinality)
        into v_schedule_platform_ids
        from public.task_schedules schedule
        cross join lateral jsonb_array_elements_text(schedule.task_payload->'platform_ids') with ordinality as item(value, ordinality)
       where schedule.id = new.schedule_id;
    end if;
    new.platform_ids := coalesce(v_schedule_platform_ids,
      case when new.platform_id is null then '{}'::uuid[] else array[new.platform_id] end);
  end if;

  select coalesce(array_agg(selected.id order by selected.first_position), '{}'::uuid[])
    into new.platform_ids
    from (
      select id, min(position) as first_position
        from unnest(new.platform_ids) with ordinality as item(id, position)
       group by id
    ) selected;

  select count(*) into v_invalid_count
    from unnest(new.platform_ids) selected(id)
   where not exists (select 1 from public.platforms platform where platform.id = selected.id);
  if v_invalid_count > 0 then
    raise exception 'One or more selected marketplaces no longer exist';
  end if;

  new.platform_id := new.platform_ids[1];
  return new;
end
$$;

revoke all on function public.sync_task_platform_ids() from public, anon, authenticated;
drop trigger if exists tasks_sync_platform_ids on public.tasks;
create trigger tasks_sync_platform_ids
  before insert or update of platform_id, platform_ids, schedule_id on public.tasks
  for each row execute function public.sync_task_platform_ids();

create or replace function public.sync_task_schedule_platform_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.task_schedules
     set task_payload = jsonb_set(
           jsonb_set(task_payload, '{platform_ids}', to_jsonb(new.platform_ids), true),
           '{platform_id}', coalesce(to_jsonb(new.platform_id), 'null'::jsonb), true
         ),
         updated_at = now()
   where id = new.schedule_id;
  return new;
end
$$;

revoke all on function public.sync_task_schedule_platform_ids() from public, anon, authenticated;
drop trigger if exists sync_task_schedule_platform_ids on public.tasks;
create trigger sync_task_schedule_platform_ids
  after update of platform_ids, platform_id on public.tasks
  for each row
  when (new.schedule_id is not null and (new.platform_ids is distinct from old.platform_ids or new.platform_id is distinct from old.platform_id))
  execute function public.sync_task_schedule_platform_ids();

-- Keep staff status changes restricted to the active assignee or assigner,
-- regardless of staff role. Client review RPCs retain their client pathway.
create or replace function public.guard_task_status_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or auth_role() = 'client' then
    return new;
  end if;

  if auth.uid() is distinct from old.assignee_id
     and auth.uid() is distinct from old.assigned_by then
    raise exception 'Only the assignee or the person who assigned this task can change its status';
  end if;

  return new;
end
$$;

-- Preserve the assignee/assigner trigger and all other task guards, but remove
-- the obsolete employee-role restriction on review/completion statuses.
do $$
declare
  v_definition text;
  v_old_rule text := $rule$raise exception 'Only a team lead or manager can move a task to Client review, mark it completed, or request changes';$rule$;
begin
  select pg_get_functiondef('public.guard_task_write()'::regprocedure) into v_definition;
  if position(v_old_rule in v_definition) > 0 then
    execute replace(v_definition, v_old_rule, 'null;');
  end if;
end
$$;

-- Keep multi-platform selections when an existing recurring schedule is edited.
do $$
declare
  v_definition text;
  v_old_field text := $field$'platform_id', t.platform_id,$field$;
  v_new_field text := $field$'platform_id', t.platform_id,
           'platform_ids', t.platform_ids,$field$;
begin
  select pg_get_functiondef('public.update_task_schedule(uuid,text,integer,date,time,boolean)'::regprocedure) into v_definition;
  if position($field$'platform_ids', t.platform_ids,$field$ in v_definition) = 0 then
    if position(v_old_field in v_definition) = 0 then
      raise exception 'Expected platform field in update_task_schedule() was not found';
    end if;
    execute replace(v_definition, v_old_field, v_new_field);
  end if;
end
$$;
