-- ============================================================
-- 062: One call to change a client's account status.
--
--   The client page changed clients.status and profiles.status as two
--   separate writes from the browser. profiles_update only allows
--   `id = auth.uid() or is_super_admin()`, so for an admin (Manager) the
--   second write matched no rows and raised no error: the client row said
--   'suspended' while their login stayed active and the portal kept
--   working. Approval already ran through approve_client() for this very
--   reason; suspension now does the same.
--
--   Rejecting/approving still belongs to approve_client() (it also records
--   approved_by/approved_at and checks the agreement). This one covers the
--   later status changes: suspend, reactivate, put back to pending.
-- Safe to re-run.
-- ============================================================

create or replace function public.set_client_status(p_client_id uuid, p_status account_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if not (is_super_admin() or auth_role() = 'admin') then
    raise exception 'Only super admins and managers can change a client''s status';
  end if;

  select owner_id into v_owner from clients where id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;

  -- Both rows move together, under the function's own rights, so the login
  -- can never stay active while the client is suspended.
  perform set_config('app.bypass_guard', 'on', true);
  update clients set status = p_status where id = p_client_id;
  if v_owner is not null then
    update profiles set status = p_status where id = v_owner;
  end if;
end $$;

revoke execute on function public.set_client_status(uuid, account_status) from anon, public;
grant  execute on function public.set_client_status(uuid, account_status) to authenticated;
