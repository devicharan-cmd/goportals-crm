-- ============================================================
-- 052: Seed 15 more staff invites, all role 'employee', spread across
--   every department — on top of 051's 6 (mixed employee/team_lead).
--   Same as 051: this only writes `invites` rows. Claude then creates
--   the matching real Supabase Auth accounts itself (test accounts on
--   this local dev app — a permitted action), which is what actually
--   makes handle_new_user() (016) create active `profiles` rows.
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
  if exists (select 1 from invites where lower(email) = 'rohan.mehta@goportals.test') then
    raise notice 'Second staff invite batch already applied — skipping.';
    return;
  end if;

  insert into invites (email, role, full_name, job_title, department_ids, invited_by) values
    ('rohan.mehta@goportals.test',     'employee', 'Rohan Mehta',      'Ads Specialist',        array[v_dept_ads],        v_admin),
    ('isha.kapoor@goportals.test',     'employee', 'Isha Kapoor',      'Ads Specialist',        array[v_dept_ads],        v_admin),
    ('vikram.singh@goportals.test',    'employee', 'Vikram Singh',     'Ads Specialist',        array[v_dept_ads],        v_admin),
    ('pooja.desai@goportals.test',     'employee', 'Pooja Desai',      'Listing Specialist',    array[v_dept_listing],    v_admin),
    ('aditya.rao@goportals.test',      'employee', 'Aditya Rao',       'Listing Specialist',    array[v_dept_listing],    v_admin),
    ('neha.gupta@goportals.test',      'employee', 'Neha Gupta',       'Listing Specialist',    array[v_dept_listing],    v_admin),
    ('siddharth.joshi@goportals.test', 'employee', 'Siddharth Joshi',  'Operations Executive',  array[v_dept_ops],        v_admin),
    ('kavya.menon@goportals.test',     'employee', 'Kavya Menon',      'Operations Executive',  array[v_dept_ops],        v_admin),
    ('manish.tiwari@goportals.test',   'employee', 'Manish Tiwari',    'Operations Executive',  array[v_dept_ops],        v_admin),
    ('riya.choudhary@goportals.test',  'employee', 'Riya Choudhary',   'Reporting Analyst',     array[v_dept_reporting],  v_admin),
    ('abhishek.pillai@goportals.test', 'employee', 'Abhishek Pillai',  'Reporting Analyst',     array[v_dept_reporting],  v_admin),
    ('divya.krishnan@goportals.test',  'employee', 'Divya Krishnan',   'Onboarding Executive',  array[v_dept_onboarding], v_admin),
    ('varun.malhotra@goportals.test',  'employee', 'Varun Malhotra',   'Onboarding Executive',  array[v_dept_onboarding], v_admin),
    ('shreya.bhatt@goportals.test',    'employee', 'Shreya Bhatt',     'Grievance Executive',   array[v_dept_grievance],  v_admin),
    ('nikhil.saxena@goportals.test',   'employee', 'Nikhil Saxena',    'Grievance Executive',   array[v_dept_grievance],  v_admin);

  raise notice 'Seeded 15 more staff invites (employee role).';
end $$;
