-- ============================================================
-- 051: Seed staff invites — 6 test employees/team leads spread across
--   departments, for Team page / workload testing.
--
--   This ONLY writes `invites` rows (plain SQL, safe) — it does NOT
--   create any auth.users/profiles rows. A profile only gets created
--   by the handle_new_user() trigger (016) when someone actually signs
--   up with one of these emails, at which point the trigger reads the
--   matching invite and gives them the role/department set here. Until
--   then these are just pending invites (visible in Admin → Users & invites),
--   not team members — "Team" / workload pages won't show them yet.
--
--   To actually create the accounts: go to Admin → Users & invites in
--   the app and use "Invite" for each (it'll find no existing invite
--   matching email+role+department and may create a duplicate — if so,
--   cancel one), or send each invite link to someone who signs up with
--   that email. There's no way to get a real auth.users row from plain
--   SQL, and Claude Code does not call Supabase's user-creation API on
--   your behalf — see project memory "feedback-no-direct-db-write".
-- Safe to re-run: skips entirely if these invites already exist.
-- ============================================================

do $$
declare
  v_dept_ads         uuid := (select id from departments where slug = 'ads');
  v_dept_listing     uuid := (select id from departments where slug = 'listing');
  v_dept_onboarding  uuid := (select id from departments where slug = 'onboarding');
  v_dept_ops         uuid := (select id from departments where slug = 'operations');
  v_dept_reporting   uuid := (select id from departments where slug = 'reporting');
  v_dept_grievance   uuid := (select id from departments where slug = 'grievance');
  v_admin            uuid := (select id from profiles where role = 'super_admin' order by created_at limit 1);
begin
  if exists (select 1 from invites where lower(email) = 'priya.sharma@goportals.test') then
    raise notice 'Staff invite seed already applied — skipping.';
    return;
  end if;

  insert into invites (email, role, full_name, job_title, department_ids, invited_by) values
    ('priya.sharma@goportals.test',  'team_lead', 'Priya Sharma',  'Ads Team Lead',          array[v_dept_ads],         v_admin),
    ('rahul.verma@goportals.test',   'employee',  'Rahul Verma',   'Listing Specialist',     array[v_dept_listing],     v_admin),
    ('ananya.iyer@goportals.test',   'employee',  'Ananya Iyer',   'Operations Executive',   array[v_dept_ops],         v_admin),
    ('karthik.reddy@goportals.test', 'employee',  'Karthik Reddy', 'Reporting Analyst',      array[v_dept_reporting],   v_admin),
    ('sneha.patil@goportals.test',   'team_lead', 'Sneha Patil',   'Onboarding Team Lead',   array[v_dept_onboarding],  v_admin),
    ('arjun.nair@goportals.test',    'employee',  'Arjun Nair',    'Grievance Executive',    array[v_dept_grievance],   v_admin);

  raise notice 'Seeded 6 staff invites. They become real team members only once someone signs up with one of these emails.';
end $$;
