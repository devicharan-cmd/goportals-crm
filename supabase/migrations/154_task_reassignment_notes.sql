create table if not exists public.task_assignment_notes (
  task_activity_id uuid primary key references public.task_activity(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  note text not null check (length(trim(note)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.task_assignment_notes enable row level security;

revoke all on public.task_assignment_notes from public, anon;
grant select on public.task_assignment_notes to authenticated;

drop policy if exists task_assignment_notes_select on public.task_assignment_notes;
create policy task_assignment_notes_select on public.task_assignment_notes for select to authenticated
  using (is_staff() and can_see_task(task_id));

create or replace function public.store_task_assignment_note() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_note text := nullif(left(trim(current_setting('app.task_reassignment_note', true)), 500), '');
begin
  if new.action = 'assignee_changed' and v_note is not null then
    insert into public.task_assignment_notes (task_activity_id, task_id, actor_id, note)
    values (new.id, new.task_id, new.actor_id, v_note);
  end if;
  return new;
end
$$;

revoke all on function public.store_task_assignment_note() from public, anon, authenticated;

drop trigger if exists task_activity_store_reassignment_note on public.task_activity;
create trigger task_activity_store_reassignment_note
  after insert on public.task_activity
  for each row execute function public.store_task_assignment_note();

create or replace function public.reassign_task(
  p_task_id uuid,
  p_assignee_id uuid,
  p_note text default null
) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_note is not null and length(trim(p_note)) > 500 then
    raise exception 'Reassignment notes must be 500 characters or fewer';
  end if;

  perform set_config('app.task_reassignment_note', coalesce(trim(p_note), ''), true);

  update public.tasks
  set assignee_id = p_assignee_id
  where id = p_task_id;

  if not found then
    raise exception 'Task not found or you do not have permission to reassign it';
  end if;
end
$$;

revoke all on function public.reassign_task(uuid, uuid, text) from public, anon;
grant execute on function public.reassign_task(uuid, uuid, text) to authenticated;
