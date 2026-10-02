-- ============================================================
-- 013: client_platforms → ecommerce_accounts
--   A client can now have MULTIPLE accounts on the SAME platform
--   (e.g. two Amazon seller accounts), each with its own stable id,
--   name, external seller/merchant id, status, etc.
--   Evolves the existing client_platforms table in place rather than
--   adding a parallel table — it already held per-(client,platform)
--   account data (seller_id, listing counts), just without the
--   surrogate key needed to allow more than one row per platform.
-- Safe to re-run: guards re-creation of things that already exist.
-- ============================================================

do $$ begin
  create type ecommerce_account_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

-- Only rename if this hasn't already run (re-running after a prior successful
-- apply must not fail just because client_platforms is gone — it's gone
-- because this already worked).
do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'client_platforms')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ecommerce_accounts') then
    alter table client_platforms rename to ecommerce_accounts;
  end if;
end $$;

alter table ecommerce_accounts drop constraint if exists client_platforms_pkey;

alter table ecommerce_accounts
  add column if not exists id           uuid default gen_random_uuid(),
  add column if not exists account_name text,
  add column if not exists store_url    text,
  add column if not exists country      text,
  add column if not exists currency     text,
  add column if not exists status       ecommerce_account_status not null default 'active',
  add column if not exists created_by   uuid references profiles(id) on delete set null,
  add column if not exists updated_at   timestamptz not null default now();

-- Backfill a sensible default name for existing rows: "<Client> <Platform>".
update ecommerce_accounts ea
set account_name = c.company_name || ' ' || p.name
from clients c, platforms p
where ea.client_id = c.id and ea.platform_id = p.id and ea.account_name is null;

alter table ecommerce_accounts alter column account_name set not null;

do $$ begin
  alter table ecommerce_accounts add constraint ecommerce_accounts_name_nonempty check (length(trim(account_name)) > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ecommerce_accounts add constraint ecommerce_accounts_listings_sane check (live_listings <= total_listings);
exception when duplicate_object then null; end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'ecommerce_accounts'::regclass and contype = 'p'
  ) then
    alter table ecommerce_accounts add primary key (id);
  end if;
end $$;

-- A named UNIQUE constraint backs itself with a same-named index, so a repeat
-- run can fail with either duplicate_object (42710) or duplicate_table (42P07,
-- Postgres treats the index as a relation) depending on exactly what already
-- exists — catch both.
do $$ begin
  alter table ecommerce_accounts
    add constraint ecommerce_accounts_client_platform_name_uniq unique (client_id, platform_id, account_name);
exception when duplicate_object or duplicate_table then null; end $$;

create unique index if not exists ecommerce_accounts_platform_seller_uniq
  on ecommerce_accounts (platform_id, seller_id) where seller_id is not null;

create index if not exists ecommerce_accounts_client_idx        on ecommerce_accounts (client_id);
create index if not exists ecommerce_accounts_platform_idx      on ecommerce_accounts (platform_id);
create index if not exists ecommerce_accounts_client_status_idx on ecommerce_accounts (client_id, status);

drop trigger if exists ecommerce_accounts_set_updated_at on ecommerce_accounts;
create trigger ecommerce_accounts_set_updated_at
  before update on ecommerce_accounts for each row execute function set_updated_at();

-- ─── RLS: same predicates as client_platforms had, renamed onto the new table ───
drop policy if exists client_platforms_select on ecommerce_accounts;
drop policy if exists client_platforms_write  on ecommerce_accounts;
drop policy if exists ecommerce_accounts_select on ecommerce_accounts;
drop policy if exists ecommerce_accounts_write  on ecommerce_accounts;

create policy ecommerce_accounts_select on ecommerce_accounts for select to authenticated
  using (is_super_admin() or auth_role() = 'manager' or client_id = my_client_id());
create policy ecommerce_accounts_write  on ecommerce_accounts for all    to authenticated
  using (is_super_admin() or manager_covers_client(client_id))
  with check (is_super_admin() or manager_covers_client(client_id));

-- ─── save_client_onboarding(): point at ecommerce_accounts ───
-- Only touches accounts the client self-selected (created_by = the client's own
-- login); accounts an admin has already set up for the client are left alone,
-- and a platform that already has any account (self- or admin-created) is not
-- given a second generic placeholder.
create or replace function public.save_client_onboarding(
  p_company          jsonb,     -- {company_name, gstin, contact_name, contact_email, contact_phone}
  p_platform_ids     uuid[],
  p_service_ids      uuid[],
  p_custom_services  text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile   profiles%rowtype;
  v_client_id uuid;
  v_status    account_status;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'client' then
    raise exception 'Only client accounts can complete onboarding';
  end if;
  if length(trim(coalesce(p_company->>'company_name', ''))) = 0 then
    raise exception 'Company name is required';
  end if;

  select id, status into v_client_id, v_status from clients where owner_id = auth.uid();

  if v_client_id is null then
    insert into clients (company_name, gstin, contact_name, contact_email, contact_phone,
                         owner_id, status, signup_source, created_by)
    values (trim(p_company->>'company_name'),
            nullif(trim(p_company->>'gstin'), ''),
            coalesce(nullif(trim(p_company->>'contact_name'), ''), nullif(v_profile.full_name, '')),
            coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
            nullif(trim(p_company->>'contact_phone'), ''),
            auth.uid(), 'pending', coalesce(v_profile.signup_source, 'self_signup'), auth.uid())
    returning id into v_client_id;
  elsif v_status = 'pending' then
    update clients set
      company_name  = trim(p_company->>'company_name'),
      gstin         = nullif(trim(p_company->>'gstin'), ''),
      contact_name  = nullif(trim(p_company->>'contact_name'), ''),
      contact_email = coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
      contact_phone = nullif(trim(p_company->>'contact_phone'), '')
    where id = v_client_id;
  else
    raise exception 'Your account is already set up — contact your account manager to change these details';
  end if;

  -- Platforms: replace the client's own self-selected accounts.
  delete from ecommerce_accounts
  where client_id = v_client_id
    and created_by = auth.uid()
    and not (platform_id = any (coalesce(p_platform_ids, '{}')));

  insert into ecommerce_accounts (client_id, platform_id, account_name, created_by)
  select v_client_id, p.id, p.name, auth.uid() from platforms p
  where p.is_active and p.id = any (coalesce(p_platform_ids, '{}'))
    and not exists (
      select 1 from ecommerce_accounts ea
      where ea.client_id = v_client_id and ea.platform_id = p.id
    );

  -- Services: replace requested ones (active/stopped ones are managed by staff)
  delete from client_services where client_id = v_client_id and status = 'requested';
  insert into client_services (client_id, service_id)
  select v_client_id, s.id from services s
  where s.is_active and s.id = any (coalesce(p_service_ids, '{}'))
  on conflict (client_id, service_id) do nothing;
  insert into client_services (client_id, custom_name)
  select v_client_id, trim(c) from unnest(coalesce(p_custom_services, '{}')) c
  where length(trim(c)) > 0;

  return v_client_id;
end $$;
