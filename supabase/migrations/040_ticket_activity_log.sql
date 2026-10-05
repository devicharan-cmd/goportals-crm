-- ============================================================
-- 040: Ticket activity log, mirroring task_activity/log_task_activity
--   (001/002) — every ticket create/edit, through any UI path, now
--   leaves a trail: created, status_changed, assignee_changed, edited
--   (subject/description/details), priority_changed, urgent_changed.
--   Priority/urgent changes stay staff-only (is_client_visible defaults
--   false), same as tasks.
-- Safe to re-run.
-- ============================================================

create table if not exists ticket_activity (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references tickets(id) on delete cascade,
  actor_id          uuid references profiles(id) on delete set null,
  action            text not null,
  old_value         text,
  new_value         text,
  is_client_visible boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists ticket_activity_ticket_idx on ticket_activity (ticket_id, created_at);

alter table ticket_activity enable row level security;

drop policy if exists ticket_activity_select on ticket_activity;
create policy ticket_activity_select on ticket_activity for select to authenticated
  using (can_see_ticket(ticket_id) and (is_staff() or is_client_visible));

create or replace function public.log_ticket_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into ticket_activity (ticket_id, actor_id, action, new_value, is_client_visible)
    values (new.id, v_uid, 'created', new.subject, true);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value, is_client_visible)
    values (new.id, v_uid, 'status_changed', old.status::text, new.status::text, true);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value, is_client_visible)
    values (new.id, v_uid, 'assignee_changed', old.assignee_id::text, new.assignee_id::text, true);
  end if;
  if new.subject is distinct from old.subject
     or new.description is distinct from old.description
     or new.details is distinct from old.details then
    insert into ticket_activity (ticket_id, actor_id, action, is_client_visible)
    values (new.id, v_uid, 'edited', true);
  end if;
  if new.priority is distinct from old.priority then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'priority_changed', old.priority::text, new.priority::text);
  end if;
  if new.is_urgent is distinct from old.is_urgent then
    insert into ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'urgent_changed', old.is_urgent::text, new.is_urgent::text);
  end if;

  return null;
end $$;

drop trigger if exists tickets_log_activity on tickets;
create trigger tickets_log_activity after insert or update on tickets
  for each row execute function log_ticket_activity();
