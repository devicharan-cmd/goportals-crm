-- Support the active-client picker on /tickets/new. This matches its
-- status filter and company-name ordering, and covers the selected columns.
create index if not exists clients_active_company_name_id_idx
  on public.clients (company_name, id)
  where status = 'active';
