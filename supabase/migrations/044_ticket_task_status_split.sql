-- ============================================================
-- 044: Split the single shared `task_status` enum (open/in_progress/
--   in_review/blocked/done, used identically by both tasks.status and
--   tickets.status) into two real vocabularies:
--     tasks.status   -> todo, in_progress, ready_for_review,
--                       changes_requested, completed, cancelled
--     tickets.status -> new, under_review, awaiting_clarification,
--                       assigned, in_progress, ready_for_client,
--                       resolved, closed
--
--   Data mapping for EXISTING rows (confirmed, one-way):
--     tasks:   open->todo, in_progress->in_progress,
--              in_review->ready_for_review, blocked->in_progress
--              (no direct equivalent — closest "still active" state),
--              done->completed
--     tickets: open(no assignee)->new, open(has assignee)->in_progress,
--              in_progress->in_progress, in_review->under_review,
--              blocked->awaiting_clarification, done->closed
--              (permanently — these are historically finished tickets)
--
--   task_visible()/ticket_visible() are `language sql` functions with
--   an enum-typed parameter, so changing that type is a signature
--   change (CREATE OR REPLACE can't do it) — this file explicitly
--   drops and recreates every policy that depends on them (directly,
--   or transitively via can_see_task()/can_see_ticket()), rather than
--   using DROP ... CASCADE, so a missed dependency fails loudly here
--   instead of silently vanishing. guard_task_write()/guard_ticket_write()/
--   claim_task()/claim_ticket()/set_closed_at() are plpgsql with no
--   declared enum parameter — untouched here, updated in 045/046.
--
--   Also drops + recreates tasks_urgent_idx (001) alongside tickets_urgent_idx
--   — both are partial indexes whose predicate hard-codes the old 'done'
--   literal, which blocks the column type change same as a dependent policy
--   would. And fixes can_see_client() (042): it has its own 'done'-literal
--   check on an employee's urgent tasks that isn't a dropped/recreated policy,
--   so nothing else here would have caught it going stale.
--
--   NOT safe to re-run: the data-mapping CASE expressions only
--   recognize the OLD values. A second run would find none of the
--   old literals (rows already hold new values like 'todo') and the
--   CASE would evaluate to NULL, which the NOT NULL constraint on
--   both status columns will loudly reject — so a re-run fails safely
--   rather than silently corrupting data, but don't rely on that,
--   run this once.
-- ============================================================

-- ─── 1. Drop every policy that depends on task_visible()/can_see_task() ─
drop policy if exists tasks_select on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists task_comments_select on task_comments;
drop policy if exists task_comments_insert on task_comments;
drop policy if exists task_attachments_select on task_attachments;
drop policy if exists task_attachments_insert on task_attachments;
drop policy if exists task_activity_select on task_activity;
drop policy if exists time_logs_select on time_logs;
drop policy if exists time_logs_insert on time_logs;
drop policy if exists task_files_select on storage.objects;
drop policy if exists task_files_insert on storage.objects;

-- ─── 2. Drop every policy that depends on ticket_visible()/can_see_ticket() ─
drop policy if exists tickets_select on tickets;
drop policy if exists tickets_update on tickets;
drop policy if exists ticket_comments_select on ticket_comments;
drop policy if exists ticket_comments_insert on ticket_comments;
drop policy if exists ticket_attachments_select on ticket_attachments;
drop policy if exists ticket_attachments_insert on ticket_attachments;
drop policy if exists ecommerce_accounts_select on ecommerce_accounts;
drop policy if exists ticket_files_select on storage.objects;
drop policy if exists ticket_files_insert on storage.objects;
drop policy if exists ticket_activity_select on ticket_activity;

-- ─── 3. Drop the now-unreferenced wrapper + visibility functions ────
drop function if exists public.can_see_task(uuid);
drop function if exists public.can_see_ticket(uuid);
drop function if exists public.task_visible(uuid, uuid, uuid, uuid, boolean, task_status);
drop function if exists public.ticket_visible(uuid, uuid, uuid, uuid, boolean, task_status);

-- ─── 4. Drop the partial indexes whose predicates hard-code the old
--   'done' literal — blocks the column type change below ──────
drop index if exists tickets_urgent_idx;
drop index if exists tasks_urgent_idx;

-- ─── 5. New enum types ───────────────────────────────────────
do $$ begin
  create type ticket_status as enum (
    'new', 'under_review', 'awaiting_clarification', 'assigned',
    'in_progress', 'ready_for_client', 'resolved', 'closed'
  );
exception when duplicate_object then null; end $$;

-- task_status is still the OLD shared type's name until step 7 — build
-- the new tasks vocabulary under a temporary name first.
do $$ begin
  create type task_status_new as enum (
    'todo', 'in_progress', 'ready_for_review', 'changes_requested', 'completed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ─── 6. Migrate the columns ──────────────────────────────────
alter table tasks
  alter column status drop default,
  alter column status type task_status_new using (
    case status::text
      when 'open'        then 'todo'
      when 'in_progress' then 'in_progress'
      when 'in_review'   then 'ready_for_review'
      when 'blocked'     then 'in_progress'
      when 'done'        then 'completed'
    end
  )::task_status_new,
  alter column status set default 'todo'::task_status_new;

alter table tickets
  alter column status drop default,
  alter column status type ticket_status using (
    case
      when status::text = 'open' and assignee_id is null then 'new'
      when status::text = 'open'                         then 'in_progress'
      when status::text = 'in_progress'                  then 'in_progress'
      when status::text = 'in_review'                    then 'under_review'
      when status::text = 'blocked'                      then 'awaiting_clarification'
      when status::text = 'done'                         then 'closed'
    end
  )::ticket_status,
  alter column status set default 'new'::ticket_status;

-- ─── 7. Reclaim the clean name for tasks' type ───────────────
drop type task_status;
alter type task_status_new rename to task_status;

-- ─── 8. Recreate the visibility functions with the new types ─
create or replace function public.task_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid,
  p_created_by uuid, p_is_urgent boolean, p_status task_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'team_lead' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status not in ('completed', 'cancelled'))
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status not in ('completed', 'cancelled'))
    else false  -- 'client': no direct task access — see tickets
  end, false)
$$;

create or replace function public.ticket_visible(
  p_client_id uuid, p_department_id uuid, p_assignee_id uuid, p_created_by uuid,
  p_is_urgent boolean, p_status ticket_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin' then true
    when 'team_lead' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'closed')
      or (p_department_id is not null and manages_department(p_department_id))
      or manager_covers_client(p_client_id)
    when 'employee' then
         p_assignee_id = auth.uid()
      or p_created_by  = auth.uid()
      or (p_is_urgent and p_status <> 'closed')
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

create or replace function public.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select task_visible(t.client_id, t.department_id, t.assignee_id, t.created_by, t.is_urgent, t.status)
    from tasks t where t.id = p_task_id
  ), false)
$$;

create or replace function public.can_see_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select ticket_visible(t.client_id, t.department_id, t.assignee_id, t.created_by, t.is_urgent, t.status)
    from tickets t where t.id = p_ticket_id
  ), false)
$$;

-- can_see_client() (042) embeds its own task_status-literal check for an
-- employee's own urgent tasks ('done') — not a policy this file drops/recreates,
-- but the literal goes stale the moment task_status loses 'done' above, so fix
-- its body here too (CREATE OR REPLACE — same signature, no dependents to touch).
create or replace function public.can_see_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin'       then true
    when 'team_lead'   then manager_covers_client(p_client_id)
    when 'employee'    then
         exists (select 1 from client_team ct where ct.client_id = p_client_id and ct.profile_id = auth.uid())
      or exists (select 1 from tasks t
                 where t.client_id = p_client_id
                   and (t.assignee_id = auth.uid()
                        or t.created_by = auth.uid()
                        or (t.is_urgent and t.status not in ('completed', 'cancelled'))))
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;

-- ─── 9. Recreate every dropped policy, bodies unchanged ──────
create policy tasks_select on tasks for select to authenticated
  using (task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status));
create policy tasks_update on tasks for update to authenticated
  using (task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status))
  with check (true);

create policy task_comments_select on task_comments for select to authenticated
  using (can_see_task(task_id) and (is_staff() or not is_internal));
create policy task_comments_insert on task_comments for insert to authenticated
  with check (author_id = auth.uid() and can_see_task(task_id) and (is_staff() or not is_internal));

create policy task_attachments_select on task_attachments for select to authenticated
  using (can_see_task(task_id));
create policy task_attachments_insert on task_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and can_see_task(task_id));

create policy task_activity_select on task_activity for select to authenticated
  using (can_see_task(task_id) and (is_staff() or is_client_visible));

create policy time_logs_select on time_logs for select to authenticated
  using (is_staff() and can_see_task(task_id));
create policy time_logs_insert on time_logs for insert to authenticated
  with check (is_staff() and profile_id = auth.uid() and can_see_task(task_id));

create policy task_files_select on storage.objects for select to authenticated
  using (bucket_id = 'task-files'
         and can_see_task(try_uuid((storage.foldername(name))[1])));
create policy task_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files'
              and can_see_task(try_uuid((storage.foldername(name))[1])));

create policy tickets_select on tickets for select to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status));
create policy tickets_update on tickets for update to authenticated
  using (ticket_visible(client_id, department_id, assignee_id, created_by, is_urgent, status))
  with check (true);  -- column-level rules enforced by guard_ticket_write

create policy ticket_comments_select on ticket_comments for select to authenticated
  using (can_see_ticket(ticket_id) and (is_staff() or not is_internal));
create policy ticket_comments_insert on ticket_comments for insert to authenticated
  with check (author_id = auth.uid() and can_see_ticket(ticket_id) and (is_staff() or not is_internal));

create policy ticket_attachments_select on ticket_attachments for select to authenticated
  using (can_see_ticket(ticket_id));
create policy ticket_attachments_insert on ticket_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and can_see_ticket(ticket_id));

create policy ecommerce_accounts_select on ecommerce_accounts for select to authenticated
  using (
    is_super_admin() or auth_role() = 'admin' or client_id = my_client_id()
    or exists (select 1 from tickets t where t.ecommerce_account_id = ecommerce_accounts.id and can_see_ticket(t.id))
  );

create policy ticket_files_select on storage.objects for select to authenticated
  using (bucket_id = 'ticket-files'
         and can_see_ticket(try_uuid((storage.foldername(name))[1])));
create policy ticket_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-files'
              and can_see_ticket(try_uuid((storage.foldername(name))[1])));

create policy ticket_activity_select on ticket_activity for select to authenticated
  using (can_see_ticket(ticket_id) and (is_staff() or is_client_visible));

-- ─── 10. Recreate the urgent-pool partial indexes with the new terminal values ─
create index if not exists tickets_urgent_idx on tickets (created_at) where is_urgent and status <> 'closed';
create index if not exists tasks_urgent_idx on tasks (created_at) where is_urgent and status not in ('completed', 'cancelled');
