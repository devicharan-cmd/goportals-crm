-- Support the staff new-ticket form, which loads active ecommerce accounts
-- across all clients and displays each account's name and platform.
create index if not exists ecommerce_accounts_active_ticket_picker_idx
  on public.ecommerce_accounts (client_id, id)
  include (account_name, platform_id)
  where status = 'active';
