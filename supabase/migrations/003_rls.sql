-- ============================================================
-- GoPortals CRM — schema v2 (3/4): Row Level Security
-- Everything is denied unless a policy below allows it.
-- Inactive users (pending/suspended) get auth_role() = NULL → only their own
-- profile, own client row, master data and the current agreement.
-- Column-level rules (what a client may edit, who may assign) are in the
-- guard triggers in 002.
-- ============================================================

alter table profiles              enable row level security;
alter table departments           enable row level security;
alter table department_members    enable row level security;
alter table platforms             enable row level security;
alter table services              enable row level security;
alter table clients               enable row level security;
alter table client_internal       enable row level security;
alter table client_platforms      enable row level security;
alter table client_services       enable row level security;
alter table client_team           enable row level security;
alter table agreements            enable row level security;
alter table agreement_acceptances enable row level security;
alter table invites               enable row level security;
alter table tasks                 enable row level security;
alter table task_comments         enable row level security;
alter table task_attachments      enable row level security;
alter table task_activity         enable row level security;
alter table time_logs             enable row level security;
alter table notifications         enable row level security;

-- ─── profiles ────────────────────────────────────────────────
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_staff());
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or is_super_admin());
create policy profiles_delete on profiles for delete to authenticated
  using (is_super_admin());

-- Safe staff list for everyone logged in (clients see who is working on their tasks).
-- No email, phone or capacity.
create view staff_directory as
  select id, full_name, avatar_url, job_title, role
  from profiles
  where role <> 'client' and status = 'active';
revoke all on staff_directory from anon, public;
grant select on staff_directory to authenticated;

-- ─── Master data: everyone reads, super_admin writes ─────────
create policy departments_select on departments for select to authenticated using (true);
create policy departments_admin  on departments for all    to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy platforms_select on platforms for select to authenticated using (true);
create policy platforms_admin  on platforms for all    to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy services_select on services for select to authenticated using (true);
create policy services_admin  on services for all    to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy department_members_select on department_members for select to authenticated
  using (is_staff());
create policy department_members_admin  on department_members for all    to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ─── Clients ─────────────────────────────────────────────────
-- Client logins create their row through save_client_onboarding() (security definer).
create policy clients_select on clients for select to authenticated
  using (is_staff() or owner_id = auth.uid());
create policy clients_insert on clients for insert to authenticated
  with check (is_super_admin());
create policy clients_update on clients for update to authenticated
  using (is_super_admin() or manager_covers_client(id));
create policy clients_delete on clients for delete to authenticated
  using (is_super_admin());

create policy client_internal_select on client_internal for select to authenticated
  using (is_super_admin() or manager_covers_client(client_id));
create policy client_internal_update on client_internal for update to authenticated
  using (is_super_admin() or manager_covers_client(client_id));

create policy client_platforms_select on client_platforms for select to authenticated
  using (is_staff() or client_id = my_client_id());
create policy client_platforms_write  on client_platforms for all    to authenticated
  using (is_super_admin() or manager_covers_client(client_id))
  with check (is_super_admin() or manager_covers_client(client_id));

create policy client_services_select on client_services for select to authenticated
  using (is_staff() or client_id = my_client_id());
create policy client_services_write  on client_services for all    to authenticated
  using (is_super_admin() or manager_covers_client(client_id))
  with check (is_super_admin() or manager_covers_client(client_id));

create policy client_team_select on client_team for select to authenticated
  using (is_staff());
create policy client_team_write  on client_team for all    to authenticated
  using (is_super_admin() or manages_department(department_id))
  with check (is_super_admin() or manages_department(department_id));

-- ─── Agreements & invites ────────────────────────────────────
create policy agreements_select on agreements for select to authenticated
  using (is_current or is_super_admin());
create policy agreements_admin  on agreements for all    to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- Inserted only via accept_agreement(); never updated or deleted.
create policy agreement_acceptances_select on agreement_acceptances for select to authenticated
  using (is_super_admin() or profile_id = auth.uid());

create policy invites_admin on invites for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ─── Tasks ───────────────────────────────────────────────────
create policy tasks_select on tasks for select to authenticated
  using (task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status));

-- guard_task_write (BEFORE trigger) fills client_id/created_by first, then this check runs.
create policy tasks_insert on tasks for insert to authenticated
  with check (is_staff() or (auth_role() = 'client' and client_id = my_client_id()));

-- Who may change which columns is enforced by guard_task_write.
create policy tasks_update on tasks for update to authenticated
  using (task_visible(client_id, department_id, assignee_id, created_by, is_urgent, status))
  with check (true);

create policy tasks_delete on tasks for delete to authenticated
  using (is_super_admin());

-- ─── Task children ───────────────────────────────────────────
create policy task_comments_select on task_comments for select to authenticated
  using (can_see_task(task_id) and (is_staff() or not is_internal));
create policy task_comments_insert on task_comments for insert to authenticated
  with check (author_id = auth.uid() and can_see_task(task_id) and (is_staff() or not is_internal));
create policy task_comments_update on task_comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and (is_staff() or not is_internal));
create policy task_comments_delete on task_comments for delete to authenticated
  using (author_id = auth.uid() or is_super_admin());

create policy task_attachments_select on task_attachments for select to authenticated
  using (can_see_task(task_id));
create policy task_attachments_insert on task_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and can_see_task(task_id));
create policy task_attachments_delete on task_attachments for delete to authenticated
  using (uploaded_by = auth.uid() or is_super_admin());

-- Written only by the log_task_activity trigger.
create policy task_activity_select on task_activity for select to authenticated
  using (can_see_task(task_id) and (is_staff() or is_client_visible));

create policy time_logs_select on time_logs for select to authenticated
  using (is_staff() and can_see_task(task_id));
create policy time_logs_insert on time_logs for insert to authenticated
  with check (is_staff() and profile_id = auth.uid() and can_see_task(task_id));
create policy time_logs_update on time_logs for update to authenticated
  using (profile_id = auth.uid() or is_super_admin());
create policy time_logs_delete on time_logs for delete to authenticated
  using (profile_id = auth.uid() or is_super_admin());

-- Written only by triggers / service role.
create policy notifications_select on notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete on notifications for delete to authenticated
  using (recipient_id = auth.uid());

-- ─── Storage: private bucket, files at '<task_id>/<file>' ────
insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', false)
on conflict (id) do nothing;

create policy task_files_select on storage.objects for select to authenticated
  using (bucket_id = 'task-files'
         and can_see_task(try_uuid((storage.foldername(name))[1])));
create policy task_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files'
              and can_see_task(try_uuid((storage.foldername(name))[1])));
create policy task_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-files'
         and (is_super_admin()
              or exists (select 1 from public.task_attachments a
                         where a.storage_path = storage.objects.name
                           and a.uploaded_by = auth.uid())));
