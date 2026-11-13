-- Let the active staff member who created a task delete it, while preserving
-- Super Admin deletion access to every task.
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (
    is_super_admin()
    or (
      auth_role() in ('manager', 'team_lead', 'employee')
      and created_by = auth.uid()
    )
  );
