-- ============================================================
-- GoPortals CRM — test seed data (dashboard / filters / tasks list testing)
-- Run this in the Supabase SQL editor (same as every other migration in
-- this repo — see CLAUDE.md "Schema drift").
--
-- Creates 6 sample clients + 20 sample tasks spread across every
-- task_status / priority, with due dates spanning overdue → future so
-- DueDate coloring, the Working/Done dashboard panel, urgent pool and
-- "New client requests" card all have something to show.
--
-- Tasks are assigned round-robin across whatever active staff
-- (manager/employee) profiles already exist — it does NOT create fake
-- auth users (that requires the real Supabase Auth API, not SQL). If no
-- staff exist yet, tasks are seeded unassigned; re-run after inviting
-- staff to get assignees.
--
-- Safe to re-run: skips entirely if the seed clients already exist.
-- To remove this data later: delete from clients where company_name like '%(seed)';
-- (cascades to client_platforms/client_team/client_internal/tasks).
-- ============================================================

-- Round-robin helper: a plain DO block can't declare its own function, so
-- this lives in pg_temp (session-local) and is dropped again at the end.
create temporary sequence if not exists gp_seed_assignee_seq;

create or replace function pg_temp.gp_next_assignee(p_staff uuid[]) returns uuid
language sql as $$
  select case when coalesce(array_length(p_staff, 1), 0) = 0 then null
    else p_staff[(nextval('gp_seed_assignee_seq') % array_length(p_staff, 1))::int + 1]
  end
$$;

do $$
declare
  v_dept_ads         uuid := (select id from departments where slug = 'ads');
  v_dept_listing     uuid := (select id from departments where slug = 'listing');
  v_dept_onboarding  uuid := (select id from departments where slug = 'onboarding');
  v_dept_ops         uuid := (select id from departments where slug = 'operations');
  v_dept_reporting   uuid := (select id from departments where slug = 'reporting');
  v_dept_grievance   uuid := (select id from departments where slug = 'grievance');

  v_plat_amazon      uuid := (select id from platforms where name = 'Amazon');
  v_plat_flipkart    uuid := (select id from platforms where name = 'Flipkart');
  v_plat_blinkit     uuid := (select id from platforms where name = 'Blinkit');
  v_plat_meesho      uuid := (select id from platforms where name = 'Meesho');
  v_plat_nykaa       uuid := (select id from platforms where name = 'Nykaa');

  v_svc_ads          uuid := (select id from services where name = 'Ads Management');
  v_svc_listing      uuid := (select id from services where name = 'Product Listing');
  v_svc_ops          uuid := (select id from services where name = 'Account Management');
  v_svc_reporting    uuid := (select id from services where name = 'Reporting & Analytics');

  v_admin            uuid := (select id from profiles where role = 'super_admin' order by created_at limit 1);
  v_staff            uuid[] := (select coalesce(array_agg(id order by created_at), '{}')
                                 from profiles where role in ('manager', 'employee') and status = 'active');
  v_staff_count      int := coalesce(array_length(v_staff, 1), 0);
  v_cid              uuid;
begin
  if exists (select 1 from clients where company_name = 'Ananta Foods (seed)') then
    raise notice 'Test seed already applied — skipping. (delete clients where company_name like ''%%(seed)'' to reset)';
    return;
  end if;

  -- ── Client 1: Ananta Foods — scale, healthy, ads + fulfilment tasks ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Ananta Foods (seed)', 'Rohit Sharma', 'rohit@ananta.example', '9800000001', 'active', 'scale', 'admin_created', v_admin, now() - interval '180 days')
  returning id into v_cid;

  insert into client_internal (client_id, health_score, contract_start, contract_end, monthly_retainer)
  values (v_cid, 82, current_date - interval '180 days', current_date + interval '185 days', 45000);

  insert into client_platforms (client_id, platform_id, seller_id, total_listings, live_listings) values
    (v_cid, v_plat_amazon, 'A1ANANTA', 120, 110),
    (v_cid, v_plat_flipkart, 'FKANANTA', 80, 75);

  if v_admin is not null then insert into client_team (client_id, profile_id, department_id) values (v_cid, v_admin, v_dept_ads); end if;

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Launch Diwali sponsored ads campaign', 'task', 'in_progress', 'P1', true,  'internal', v_dept_ads,     v_plat_amazon,   v_svc_ads,       current_date + 1, 'today',      pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '3 days'),
    (v_cid, 'Fix ACOS spike on top 10 SKUs',        'issue', 'open',        'P2', false, 'internal', v_dept_ads,     v_plat_amazon,   v_svc_ads,       current_date - 2, 'today',      pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '5 days'),
    (v_cid, 'Monthly performance report — Sep',      'task', 'done',        'P3', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date - 10, null,        pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '15 days'),
    (v_cid, 'Re-list 5 discontinued SKUs on Flipkart','task','blocked',     'P2', false, 'internal', v_dept_listing, v_plat_flipkart, v_svc_listing,   current_date + 4, 'this_week',  pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '2 days');

  -- ── Client 2: Vivid Home & Living — retention, quiet ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Vivid Home & Living (seed)', 'Priya Nair', 'priya@vividhome.example', '9800000002', 'active', 'retention', 'admin_created', v_admin, now() - interval '400 days')
  returning id into v_cid;

  insert into client_internal (client_id, health_score, contract_start, contract_end, monthly_retainer)
  values (v_cid, 64, current_date - interval '400 days', current_date + interval '25 days', 30000); -- contract renewal due soon

  insert into client_platforms (client_id, platform_id, total_listings, live_listings) values (v_cid, v_plat_meesho, 60, 58);

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Renew contract — send new terms',     'task', 'open',        'P2', false, 'internal', v_dept_ops,   v_plat_meesho, v_svc_ops, current_date + 20, 'this_month', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '1 day'),
    (v_cid, 'Weekly inventory sync check',         'task', 'in_review',   'P3', false, 'internal', v_dept_ops,   v_plat_meesho, v_svc_ops, current_date,      'today',      pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '4 days'),
    (v_cid, 'Customer complaint — delayed refund',  'grievance', 'done',  'P2', false, 'internal', v_dept_grievance, v_plat_meesho, null, current_date - 8, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '9 days');

  -- ── Client 3: Zenith Sportswear — setup stage, urgent + unassigned mix ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Zenith Sportswear (seed)', 'Karan Mehta', 'karan@zenith.example', '9800000003', 'active', 'setup', 'admin_created', v_admin, now() - interval '25 days')
  returning id into v_cid;

  insert into client_internal (client_id, health_score, contract_start, monthly_retainer)
  values (v_cid, 70, current_date - interval '25 days', 25000);

  insert into client_platforms (client_id, platform_id, total_listings, live_listings) values (v_cid, v_plat_blinkit, 30, 12);

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Blinkit listing approval stuck',       'issue', 'blocked',     'P1', true,  'internal', v_dept_onboarding, v_plat_blinkit, null, current_date - 1, 'today', null, null, v_admin, now() - interval '2 days'), -- urgent + unassigned
    (v_cid, 'Upload brand assets for storefront',    'task',  'open',       'P3', false, 'internal', v_dept_listing,    v_plat_blinkit, v_svc_listing, current_date + 6, 'this_week', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '1 day'),
    (v_cid, 'Client wants ad budget increased',       'request','open',     'P2', false, 'client',   v_dept_ads,        v_plat_blinkit, null, null, null, null, null, null, now() - interval '6 hours'); -- client request, unassigned

  -- ── Client 4: Pure Glow Cosmetics — fresh onboarding ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Pure Glow Cosmetics (seed)', 'Neha Verma', 'neha@pureglow.example', '9800000004', 'active', 'onboarding', 'admin_created', v_admin, now() - interval '4 days')
  returning id into v_cid;

  insert into client_internal (client_id, health_score, contract_start, monthly_retainer)
  values (v_cid, 75, current_date - interval '4 days', 20000);

  insert into client_platforms (client_id, platform_id, total_listings, live_listings) values (v_cid, v_plat_nykaa, 15, 0);

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Seller onboarding — brand registry',  'task', 'in_progress', 'P1', false, 'internal', v_dept_onboarding, v_plat_nykaa, null, current_date + 2, 'this_week', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '3 days'),
    (v_cid, 'Draft first 10 product listings',      'task', 'open',        'P2', false, 'internal', v_dept_listing,    v_plat_nykaa, v_svc_listing, current_date + 7, 'this_week', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '2 days'),
    (v_cid, 'Kickoff call notes & requirements',     'request','open',     'P3', false, 'client',   null, null, null, null, null, null, null, null, now() - interval '1 day'); -- client request, unassigned

  -- ── Client 5: Northline Electronics — scale, heavy load for one assignee ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Northline Electronics (seed)', 'Arjun Rao', 'arjun@northline.example', '9800000005', 'active', 'scale', 'admin_created', v_admin, now() - interval '260 days')
  returning id into v_cid;

  insert into client_internal (client_id, health_score, contract_start, contract_end, monthly_retainer)
  values (v_cid, 90, current_date - interval '260 days', current_date + interval '100 days', 60000);

  insert into client_platforms (client_id, platform_id, total_listings, live_listings) values
    (v_cid, v_plat_amazon, 200, 195), (v_cid, v_plat_flipkart, 150, 148);

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Q3 ads performance deep-dive',          'task', 'in_review',   'P2', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date + 1, 'today', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '5 days'),
    (v_cid, 'Price sync issue — Flipkart vs Amazon',  'issue','in_progress','P1', true,  'internal', v_dept_ops,       v_plat_flipkart, v_svc_ops, current_date, 'today', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '1 day'),
    (v_cid, 'Festive catalogue refresh',              'task', 'open',       'P3', false, 'internal', v_dept_listing,   v_plat_amazon, v_svc_listing, current_date + 12, 'this_month', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '2 days'),
    (v_cid, 'August performance report',              'task', 'done',       'P3', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date - 30, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '31 days'),
    (v_cid, 'July performance report',                'task', 'done',       'P3', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date - 60, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '61 days');

  -- ── Client 6: BrightLeaf Tea Co — churned, mostly closed history ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('BrightLeaf Tea Co (seed)', 'Simran Kaur', 'simran@brightleaf.example', '9800000006', 'active', 'churned', 'admin_created', v_admin, now() - interval '500 days')
  returning id into v_cid;

  insert into client_internal (client_id, health_score, contract_start, contract_end, monthly_retainer)
  values (v_cid, 20, current_date - interval '500 days', current_date - interval '10 days', 0);

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Offboarding checklist',                 'task', 'done', 'P3', false, 'internal', v_dept_ops, null, v_svc_ops, current_date - 12, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '15 days'),
    (v_cid, 'Final invoice reconciliation',           'task', 'done', 'P3', false, 'internal', v_dept_ops, null, v_svc_ops, current_date - 14, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '20 days');

  raise notice 'Seeded 6 test clients and their tasks (% staff found for round-robin assignment).', v_staff_count;
end $$;

drop function if exists pg_temp.gp_next_assignee(uuid[]);
drop sequence if exists gp_seed_assignee_seq;
