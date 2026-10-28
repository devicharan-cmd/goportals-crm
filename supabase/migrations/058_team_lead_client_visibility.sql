-- ============================================================
-- 058: Fix can_see_client() for team_lead — it only ever checked
--   manager_covers_client() (client_team coverage), never the tasks/tickets
--   a team_lead can actually see. Found via a real symptom: a team_lead
--   with a ticket assigned to them (ticket_visible() lets them see it) for
--   a client that was never added to client_team shows "—" for Client
--   everywhere (tickets list, task list, dashboard) — the embedded
--   `client:clients(...)` join silently returns null because can_see_client()
--   denies it, even though the ticket plainly has that client_id.
--
--   Extended to mirror task_visible()/ticket_visible()'s own team_lead
--   formula: also true if a task or ticket for that client is assigned to
--   them, created by them, urgent+unassigned-eligible, or in a department
--   they manage. (employee's branch is untouched — same shape as before.)
-- Safe to re-run.
-- ============================================================

create or replace function public.can_see_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case auth_role()
    when 'super_admin' then true
    when 'admin'       then true
    when 'team_lead'   then
         manager_covers_client(p_client_id)
      or exists (select 1 from tasks t
                 where t.client_id = p_client_id
                   and (t.assignee_id = auth.uid()
                        or t.created_by = auth.uid()
                        or (t.is_urgent and t.status not in ('completed', 'cancelled'))
                        or (t.department_id is not null and manages_department(t.department_id))))
      or exists (select 1 from tickets tk
                 where tk.client_id = p_client_id
                   and (tk.assignee_id = auth.uid()
                        or tk.created_by = auth.uid()
                        or (tk.is_urgent and tk.status <> 'closed')
                        or (tk.department_id is not null and manages_department(tk.department_id))))
    when 'employee'    then
         exists (select 1 from client_team ct where ct.client_id = p_client_id and ct.profile_id = auth.uid())
      or exists (select 1 from tasks t
                 where t.client_id = p_client_id
                   and (t.assignee_id = auth.uid()
                        or t.created_by = auth.uid()
                        or (t.is_urgent and t.status not in ('completed', 'cancelled'))))
    when 'client' then p_client_id = my_client_id()
    else false
  end, false)
$$;
