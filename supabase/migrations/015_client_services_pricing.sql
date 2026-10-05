-- ============================================================
-- 015: Per-service pricing, decided by admin/super_admin at assignment time.
--   • services.default_price/default_billing_type — the editable "sticker price".
--   • client_services.agreed_price/billing_type   — frozen at assignment; never
--     rewritten when the service's default price later changes (no sync trigger).
--   • client_services can now optionally tie a service to one specific
--     ecommerce_account (e.g. "Amazon PPC" priced separately per seller account)
--     or leave it client-wide (ecommerce_account_id null).
-- RLS is unchanged: client_services_select/write (003/006) already restrict
-- writes to super_admin/manager and reads to staff-or-owning-client — that
-- covers every new column automatically since it's row-level, not column-level.
-- Safe to re-run.
-- ============================================================

do $$ begin
  create type billing_type as enum ('monthly', 'one_time', 'per_task');
exception when duplicate_object then null; end $$;

alter table services
  add column if not exists default_price        numeric(12,2) check (default_price >= 0),
  add column if not exists default_billing_type billing_type;

alter table client_services
  add column if not exists ecommerce_account_id uuid references ecommerce_accounts(id) on delete cascade,
  add column if not exists agreed_price          numeric(12,2) check (agreed_price >= 0),
  add column if not exists currency              text not null default 'INR',
  add column if not exists billing_type          billing_type not null default 'monthly',
  add column if not exists selected_by           uuid references profiles(id) on delete set null,
  add column if not exists selected_at           timestamptz;

update client_services set selected_at = created_at where selected_at is null;
alter table client_services alter column selected_at set not null,
                             alter column selected_at set default now();

-- Same service can be priced once for the whole client, or once per account —
-- never duplicated either way. (Plain UNIQUE can't do this: NULLs compare distinct.)
alter table client_services drop constraint if exists client_services_client_id_service_id_key;
create unique index if not exists client_services_whole_client_uniq
  on client_services (client_id, service_id) where ecommerce_account_id is null;
create unique index if not exists client_services_per_account_uniq
  on client_services (client_id, service_id, ecommerce_account_id) where ecommerce_account_id is not null;

create index if not exists client_services_account_idx on client_services (ecommerce_account_id);
