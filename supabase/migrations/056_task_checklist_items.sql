-- ============================================================
-- 056: Task checklists. A team_lead breaking a ticket into tasks can add
--   a checklist to a task ("Add checklist if needed" in the intended
--   workflow); the assignee ticks items off as they go.
--
--   Visibility mirrors task visibility (can_see_task()); write access is
--   narrower — assignee, or admin/super_admin, or a team_lead with the
--   same in-scope formula guard_task_write()'s UPDATE branch already uses
--   (own/created/department/client coverage) — modelled as a new
--   can_edit_task_checklist() helper rather than reusing guard_task_write()
--   itself, since that function is a row trigger on `tasks`, not something
--   callable from an RLS policy on a different table.
-- Safe to re-run.
-- ============================================================

create table if not exists public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  is_done    boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists task_checklist_items_task_idx on task_checklist_items (task_id, sort_order);

alter table public.task_checklist_items enable row level security;

create or replace function public.can_edit_task_checklist(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case auth_role()
      when 'super_admin' then true
      when 'admin' then true
      when 'team_lead' then
           t.assignee_id = auth.uid()
        or t.created_by  = auth.uid()
        or (t.department_id is not null and manages_department(t.department_id))
        or manager_covers_client(t.client_id)
      when 'employee' then t.assignee_id = auth.uid()
      else false
    end
    from tasks t where t.id = p_task_id
  ), false)
$$;

create or replace function public.stamp_checklist_item_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  return new;
end $$;

drop trigger if exists task_checklist_items_stamp on task_checklist_items;
create trigger task_checklist_items_stamp before insert on task_checklist_items
  for each row execute function stamp_checklist_item_author();

drop policy if exists task_checklist_items_select on task_checklist_items;
drop policy if exists task_checklist_items_insert on task_checklist_items;
drop policy if exists task_checklist_items_update on task_checklist_items;
drop policy if exists task_checklist_items_delete on task_checklist_items;

create policy task_checklist_items_select on task_checklist_items for select to authenticated
  using (can_see_task(task_id));
create policy task_checklist_items_insert on task_checklist_items for insert to authenticated
  with check (can_edit_task_checklist(task_id));
create policy task_checklist_items_update on task_checklist_items for update to authenticated
  using (can_edit_task_checklist(task_id));
create policy task_checklist_items_delete on task_checklist_items for delete to authenticated
  using (can_edit_task_checklist(task_id));
