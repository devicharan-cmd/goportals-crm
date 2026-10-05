-- ============================================================
-- GoPortals CRM — test seed data v2 (replaces 012, which targets the
-- pre-schema-v2 structure and is no longer runnable: it inserts into
-- `client_platforms` (renamed `ecommerce_accounts` in 004/013), assigns
-- staff with the old 'manager'/'employee' roles (042 split 'manager'
-- into 'admin'/'team_lead'), and uses the old shared task_status values
-- open/in_progress/in_review/blocked/done (044 split that into separate
-- tasks.status / tickets.status vocabularies).
--
-- Creates 6 sample clients, ~20 tasks spread across every tasks.status
-- value, and 8 tickets — one in each tickets.status value, so the ticket
-- Kanban board, task board, dashboard, urgent pool and client detail page
-- all have something in every column to check staff-side after the
-- status-split migrations (040–048).
--
-- Tasks/tickets are assigned round-robin across whatever active staff
-- (admin/team_lead/employee) profiles already exist — it does NOT create
-- fake auth users (that requires the real Supabase Auth API, not SQL).
-- If no staff exist yet, rows are seeded unassigned; re-run after inviting
-- staff to get assignees.
--
-- Safe to re-run: skips entirely if the seed clients already exist.
-- To remove this data later: delete from clients where company_name like '%(seed)';
-- (cascades to ecommerce_accounts/client_team/client_internal/tasks/tickets).
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
  v_plat_zepto       uuid := (select id from platforms where name = 'Zepto');

  v_svc_ads          uuid := (select id from services where name = 'Ads Management');
  v_svc_listing      uuid := (select id from services where name = 'Product Listing');
  v_svc_ops          uuid := (select id from services where name = 'Account Management');
  v_svc_reporting    uuid := (select id from services where name = 'Reporting & Analytics');

  v_admin            uuid := (select id from profiles where role = 'super_admin' order by created_at limit 1);
  v_staff            uuid[] := (select coalesce(array_agg(id order by created_at), '{}')
                                 from profiles where role in ('admin', 'team_lead', 'employee') and status = 'active');
  v_staff_count      int := coalesce(array_length(v_staff, 1), 0);
  v_cid              uuid;
  v_eaid             uuid;
begin
  if exists (select 1 from clients where company_name = 'Ananta Foods (seed)') then
    raise notice 'Test seed already applied — skipping. (delete clients where company_name like ''%%(seed)'' to reset)';
    return;
  end if;

  -- ── Client 1: Ananta Foods — scale, healthy, ads + fulfilment tasks ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Ananta Foods (seed)', 'Rohit Sharma', 'rohit@ananta.example', '9800000001', 'active', 'scale', 'admin_created', v_admin, now() - interval '180 days')
  returning id into v_cid;

  -- clients_create_internal (002) already auto-created the client_internal row — fill it in.
  update client_internal set health_score = 82, contract_start = current_date - interval '180 days',
    contract_end = current_date + interval '185 days', monthly_retainer = 45000
  where client_id = v_cid;

  insert into ecommerce_accounts (client_id, platform_id, account_name, seller_id, total_listings, live_listings, status)
  values (v_cid, v_plat_amazon, 'Ananta Foods – Amazon', 'A1ANANTA', 120, 110, 'active');
  insert into ecommerce_accounts (client_id, platform_id, account_name, seller_id, total_listings, live_listings, status)
  values (v_cid, v_plat_flipkart, 'Ananta Foods – Flipkart', 'FKANANTA', 80, 75, 'active')
  returning id into v_eaid; -- kept for the ticket below (Flipkart)

  if v_admin is not null then insert into client_team (client_id, profile_id, department_id) values (v_cid, v_admin, v_dept_ads); end if;

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Launch Diwali sponsored ads campaign', 'task', 'in_progress',       'P1', true,  'internal', v_dept_ads,     v_plat_amazon,   v_svc_ads,       current_date + 1, 'today',      pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '3 days'),
    (v_cid, 'Fix ACOS spike on top 10 SKUs',        'issue', 'todo',             'P2', false, 'internal', v_dept_ads,     v_plat_amazon,   v_svc_ads,       current_date - 2, 'today',      pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '5 days'),
    (v_cid, 'Monthly performance report — Sep',      'task', 'completed',        'P3', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date - 10, null,        pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '15 days'),
    (v_cid, 'Re-list 5 discontinued SKUs on Flipkart','task','changes_requested','P2', false, 'internal', v_dept_listing, v_plat_flipkart, v_svc_listing,   current_date + 4, 'this_week',  pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '2 days');

  -- price_updation hides Description on the form — the message lives in details.note, like a real submission.
  insert into tickets (client_id, ecommerce_account_id, category, subject, description, details, priority, status, is_urgent, department_id, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, v_eaid, 'price_updation', 'Match Flipkart price to Amazon', null,
     '{"update_type":"single","sku":"FKANANTA-SKU-021","old_price":"799","new_price":"749","note":"Our Flipkart price is higher than Amazon on the same SKU — please align."}'::jsonb,
     'P2', 'in_progress', false, v_dept_ops, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '2 days');

  -- ── Client 2: Vivid Home & Living — retention, quiet ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Vivid Home & Living (seed)', 'Priya Nair', 'priya@vividhome.example', '9800000002', 'active', 'retention', 'admin_created', v_admin, now() - interval '400 days')
  returning id into v_cid;

  update client_internal set health_score = 64, contract_start = current_date - interval '400 days',
    contract_end = current_date + interval '25 days', monthly_retainer = 30000 -- contract renewal due soon
  where client_id = v_cid;

  insert into ecommerce_accounts (client_id, platform_id, account_name, total_listings, live_listings, status)
  values (v_cid, v_plat_meesho, 'Vivid Home – Meesho', 60, 58, 'active')
  returning id into v_eaid;

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Renew contract — send new terms',     'task', 'todo',             'P2', false, 'internal', v_dept_ops,   v_plat_meesho, v_svc_ops, current_date + 20, 'this_month', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '1 day'),
    (v_cid, 'Weekly inventory sync check',         'task', 'ready_for_review', 'P3', false, 'internal', v_dept_ops,   v_plat_meesho, v_svc_ops, current_date,      'today',      pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '4 days'),
    (v_cid, 'Customer complaint — delayed refund',  'grievance', 'completed',  'P2', false, 'internal', v_dept_grievance, v_plat_meesho, null, current_date - 8, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '9 days');

  insert into tickets (client_id, ecommerce_account_id, category, subject, description, details, priority, status, is_urgent, department_id, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, v_eaid, 'complaint', 'Refund not processed for order #4821', 'Customer says refund still not received after 10 days.',
     '{"complaint_type":"platform"}'::jsonb, 'P2', 'resolved', false, v_dept_grievance, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '6 days'),
    (v_cid, v_eaid, 'inventory_update', 'Low stock alert on 6 SKUs', null,
     '{"update_type":"single","sku":"MESH-VH-014","note":"Please confirm which SKUs to restock before Diwali — stock below threshold."}'::jsonb,
     'P3', 'under_review', false, v_dept_ops, null, null, v_admin, now() - interval '12 hours');

  -- ── Client 3: Zenith Sportswear — setup stage, urgent + unassigned mix ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Zenith Sportswear (seed)', 'Karan Mehta', 'karan@zenith.example', '9800000003', 'active', 'setup', 'admin_created', v_admin, now() - interval '25 days')
  returning id into v_cid;

  update client_internal set health_score = 70, contract_start = current_date - interval '25 days', monthly_retainer = 25000
  where client_id = v_cid;

  insert into ecommerce_accounts (client_id, platform_id, account_name, total_listings, live_listings, status)
  values (v_cid, v_plat_blinkit, 'Zenith Sportswear – Blinkit', 30, 12, 'active')
  returning id into v_eaid;

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Blinkit listing approval stuck',       'issue', 'in_progress',      'P1', true,  'internal', v_dept_onboarding, v_plat_blinkit, null, current_date - 1, 'today', null, null, v_admin, now() - interval '2 days'), -- urgent + unassigned
    (v_cid, 'Upload brand assets for storefront',    'task',  'todo',            'P3', false, 'internal', v_dept_listing,    v_plat_blinkit, v_svc_listing, current_date + 6, 'this_week', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '1 day'),
    (v_cid, 'Client wants ad budget increased',       'request','todo',          'P2', false, 'client',   v_dept_ads,        v_plat_blinkit, null, null, null, null, null, null, now() - interval '6 hours'); -- client request, unassigned

  insert into tickets (client_id, ecommerce_account_id, category, subject, description, details, priority, status, is_urgent, department_id, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, v_eaid, 'new_listing', 'Blinkit listing stuck in approval', null,
     jsonb_build_object('note', 'Blinkit listing has been pending approval for 3 days — please check why it is stuck.'),
     'P1', 'awaiting_clarification', true, v_dept_onboarding, null, null, v_admin, now() - interval '2 days'), -- urgent + unassigned
    (v_cid, null, 'new_expansion', 'Expand to Zepto', null,
     jsonb_build_object('platform_id', v_plat_zepto, 'note', 'We want to also sell on Zepto — please advise next steps.'),
     null, 'new', false, null, null, null, v_admin, now() - interval '3 hours'); -- fresh, unassigned

  -- ── Client 4: Pure Glow Cosmetics — fresh onboarding ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Pure Glow Cosmetics (seed)', 'Neha Verma', 'neha@pureglow.example', '9800000004', 'active', 'onboarding', 'admin_created', v_admin, now() - interval '4 days')
  returning id into v_cid;

  update client_internal set health_score = 75, contract_start = current_date - interval '4 days', monthly_retainer = 20000
  where client_id = v_cid;

  insert into ecommerce_accounts (client_id, platform_id, account_name, total_listings, live_listings, status)
  values (v_cid, v_plat_nykaa, 'Pure Glow – Nykaa', 15, 0, 'active')
  returning id into v_eaid;

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Seller onboarding — brand registry',  'task', 'in_progress', 'P1', false, 'internal', v_dept_onboarding, v_plat_nykaa, null, current_date + 2, 'this_week', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '3 days'),
    (v_cid, 'Draft first 10 product listings',      'task', 'todo',       'P2', false, 'internal', v_dept_listing,    v_plat_nykaa, v_svc_listing, current_date + 7, 'this_week', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '2 days'),
    (v_cid, 'Kickoff call notes & requirements',     'request','todo',    'P3', false, 'client',   null, null, null, null, null, null, null, null, now() - interval '1 day'); -- client request, unassigned

  insert into tickets (client_id, ecommerce_account_id, category, subject, description, details, priority, status, is_urgent, department_id, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, v_eaid, 'report', 'Share onboarding progress report', 'Can we get a quick status report on the Nykaa onboarding?',
     '{"report_scope":"platform","report_type":"sales","duration":"last_30_days"}'::jsonb,
     'P3', 'assigned', false, v_dept_reporting, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '1 day');

  -- ── Client 5: Northline Electronics — scale, heavy load for one assignee ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('Northline Electronics (seed)', 'Arjun Rao', 'arjun@northline.example', '9800000005', 'active', 'scale', 'admin_created', v_admin, now() - interval '260 days')
  returning id into v_cid;

  update client_internal set health_score = 90, contract_start = current_date - interval '260 days',
    contract_end = current_date + interval '100 days', monthly_retainer = 60000
  where client_id = v_cid;

  insert into ecommerce_accounts (client_id, platform_id, account_name, total_listings, live_listings, status)
  values (v_cid, v_plat_amazon, 'Northline – Amazon', 200, 195, 'active');
  insert into ecommerce_accounts (client_id, platform_id, account_name, total_listings, live_listings, status)
  values (v_cid, v_plat_flipkart, 'Northline – Flipkart', 150, 148, 'active')
  returning id into v_eaid; -- kept for the tickets below (Flipkart)

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Q3 ads performance deep-dive',          'task', 'ready_for_review', 'P2', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date + 1, 'today', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '5 days'),
    (v_cid, 'Price sync issue — Flipkart vs Amazon',  'issue','in_progress',     'P1', true,  'internal', v_dept_ops,       v_plat_flipkart, v_svc_ops, current_date, 'today', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '1 day'),
    (v_cid, 'Festive catalogue refresh',              'task', 'todo',           'P3', false, 'internal', v_dept_listing,   v_plat_amazon, v_svc_listing, current_date + 12, 'this_month', pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '2 days'),
    (v_cid, 'August performance report',              'task', 'completed',      'P3', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date - 30, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '31 days'),
    (v_cid, 'July performance report',                'task', 'completed',      'P3', false, 'internal', v_dept_reporting, v_plat_amazon, v_svc_reporting, current_date - 60, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '61 days');

  -- closed_at is not set explicitly below — tickets_b_closed_at (045) stamps it
  -- itself from the status value, overriding any value given on insert.
  insert into tickets (client_id, ecommerce_account_id, category, subject, description, details, priority, status, is_urgent, department_id, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, v_eaid, 'shipment', 'Delayed shipment — festive order backlog', 'Multiple orders stuck in processing for 2+ days.',
     jsonb_build_object('shipment_type', 'change_existing', 'existing_shipment_detail', 'Order batch #4521-4530', 'changes_required', 'Expedite pending shipments'),
     'P1', 'ready_for_client', true, v_dept_ops, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '4 days'),
    (v_cid, v_eaid, 'ads_campaign', 'Diwali ads budget — closed out', 'Festive campaign wrapped up, final report shared.', '{}'::jsonb, 'P2', 'closed', false, v_dept_ads, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '20 days');

  -- ── Client 6: BrightLeaf Tea Co — churned, mostly closed history ──
  insert into clients (company_name, contact_name, contact_email, contact_phone, status, stage, signup_source, created_by, created_at)
  values ('BrightLeaf Tea Co (seed)', 'Simran Kaur', 'simran@brightleaf.example', '9800000006', 'active', 'churned', 'admin_created', v_admin, now() - interval '500 days')
  returning id into v_cid;

  update client_internal set health_score = 20, contract_start = current_date - interval '500 days',
    contract_end = current_date - interval '10 days', monthly_retainer = 0
  where client_id = v_cid;

  insert into tasks (client_id, title, type, status, priority, is_urgent, source, department_id, platform_id, service_id, due_date, deadline_type, assignee_id, assigned_by, created_by, created_at) values
    (v_cid, 'Offboarding checklist',                 'task', 'completed', 'P3', false, 'internal', v_dept_ops, null, v_svc_ops, current_date - 12, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '15 days'),
    (v_cid, 'Final invoice reconciliation',           'task', 'completed', 'P3', false, 'internal', v_dept_ops, null, v_svc_ops, current_date - 14, null, pg_temp.gp_next_assignee(v_staff), v_admin, v_admin, now() - interval '20 days');

  raise notice 'Seeded 6 test clients, their tasks, and 8 tickets spanning every ticket status (% staff found for round-robin assignment).', v_staff_count;
end $$;

drop function if exists pg_temp.gp_next_assignee(uuid[]);
drop sequence if exists gp_seed_assignee_seq;
