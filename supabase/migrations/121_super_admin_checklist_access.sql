-- Super admins must be able to view and manage checklists on every task.
drop policy if exists task_checklist_items_select on public.task_checklist_items;
create policy task_checklist_items_select on public.task_checklist_items for select to authenticated
  using (auth_role() = 'super_admin' or can_see_task(task_id));

drop policy if exists task_checklist_items_insert on public.task_checklist_items;
create policy task_checklist_items_insert on public.task_checklist_items for insert to authenticated
  with check (auth_role() = 'super_admin' or can_edit_task_checklist(task_id));

drop policy if exists task_checklist_items_update on public.task_checklist_items;
create policy task_checklist_items_update on public.task_checklist_items for update to authenticated
  using (auth_role() = 'super_admin' or can_edit_task_checklist(task_id))
  with check (auth_role() = 'super_admin' or can_edit_task_checklist(task_id));

drop policy if exists task_checklist_items_delete on public.task_checklist_items;
create policy task_checklist_items_delete on public.task_checklist_items for delete to authenticated
  using (auth_role() = 'super_admin' or can_edit_task_checklist(task_id));
