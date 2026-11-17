-- Match the default task-board order when staff select the company-wide scope.
create index if not exists tasks_all_scope_order_idx
  on public.tasks (
    is_urgent desc,
    due_date asc nulls last,
    created_at desc,
    id asc
  );

-- Support staff/client pickers that load clients ordered by company name.
create index if not exists clients_company_name_id_idx
  on public.clients (company_name, id);
