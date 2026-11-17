-- Super admins must always be able to create tasks and read the row returned
-- by the create form, independently of helper-function visibility rules.

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (auth_role() = 'super_admin' or is_staff());

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    auth_role() = 'super_admin'
    or (
      public.can_see_task(id)
      and (auth_role() <> 'client' or (ticket_id is not null and visibility = 'public'))
    )
  );
