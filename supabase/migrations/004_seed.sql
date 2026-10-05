-- ============================================================
-- GoPortals CRM — schema v2 (4/4): starter data
-- Safe to re-run (on conflict do nothing). Edit lists later from the app.
-- ============================================================

insert into departments (name, slug, sort_order) values
  ('Ads',         'ads',         1),
  ('Listing',     'listing',     2),
  ('Onboarding',  'onboarding',  3),
  ('Operations',  'operations',  4),
  ('Reporting',   'reporting',   5),
  ('Grievance',   'grievance',   6)
on conflict (slug) do nothing;

insert into platforms (name, category, sort_order) values
  ('Amazon',           'marketplace',    1),
  ('Flipkart',         'marketplace',    2),
  ('Myntra',           'marketplace',    3),
  ('Meesho',           'marketplace',    4),
  ('Nykaa',            'marketplace',    5),
  ('JioMart',          'marketplace',    6),
  ('Blinkit',          'quick_commerce', 10),
  ('Zepto',            'quick_commerce', 11),
  ('Swiggy Instamart', 'quick_commerce', 12),
  ('BigBasket',        'quick_commerce', 13),
  ('Flipkart Minutes', 'quick_commerce', 14),
  ('Own Website',      'd2c',            20)
on conflict (name) do nothing;

insert into services (name, description, department_id, sort_order)
select v.name, v.description, d.id, v.sort_order
from (values
  ('Ads Management',              'Sponsored ads setup, optimisation and reporting', 'ads',        1),
  ('Product Listing',             'New listings, variations and listing fixes',      'listing',    2),
  ('Catalogue & Content',         'Titles, images, A+ content, SEO',                 'listing',    3),
  ('Account Onboarding & Setup',  'Seller account registration, brand registry',     'onboarding', 4),
  ('Quick Commerce Onboarding',   'Blinkit / Zepto / Instamart onboarding',          'onboarding', 5),
  ('Account Management',          'Day-to-day operations, inventory, orders',        'operations', 6),
  ('Reporting & Analytics',       'Monthly performance reports',                     'reporting',  7),
  ('Grievance & Case Handling',   'Seller support cases, claims, reimbursements',    'grievance',  8)
) as v(name, description, dept_slug, sort_order)
join departments d on d.slug = v.dept_slug
on conflict (name) do nothing;

-- Placeholder agreement — replace the text from the app (Admin → Agreements) before going live.
insert into agreements (version, title, body, is_current, published_at) values (
  'v1',
  'GoPortals Service Agreement',
  E'# GoPortals Service Agreement\n\n_Replace this placeholder with your real terms._\n\n1. Scope of services\n2. Fees and payment\n3. Client responsibilities (account access, timely approvals)\n4. Confidentiality\n5. Term and termination',
  true,
  now()
)
on conflict (version) do nothing;

-- ─── First super admin ───────────────────────────────────────
-- 1. Sign up once at /signup (or create the user in Supabase → Authentication).
-- 2. Run this with your email:
--
--   update profiles set role = 'super_admin', status = 'active'
--   where email = 'you@goportals.co';
