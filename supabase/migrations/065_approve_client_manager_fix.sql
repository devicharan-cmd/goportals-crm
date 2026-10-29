-- ============================================================
-- 065: Let a manager actually approve or reject a client.
--
--   approve_client() allows `admin` (Manager) by its own check, then fails
--   on the very next statement: it updates profiles.status for the client's
--   owner, and guard_profile_update() runs in the *acting user's* context,
--   where only a super admin may change someone else's status. A manager
--   pressing Approve or Reject got:
--     "Only a super admin can change role, status, email or capacity"
--   so no client could be approved by anyone but the super admin.
--
--   set_client_status() (062) already bypasses the guard for exactly this
--   reason; approve_client() was never given the same treatment. Same
--   pattern, same two lines.
--
--   Permissions are unchanged: still super admin or admin only, still
--   requires an accepted agreement before approving.
-- Safe to re-run.
-- ============================================================

create or replace function public.approve_client(p_client_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_status account_status := case when p_approve then 'active' else 'rejected' end;
begin
  if not (is_super_admin() or auth_role() = 'admin') then
    raise exception 'Only super admins and admins can approve clients';
  end if;
  select owner_id into v_owner from clients where id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;
  if p_approve and not exists (select 1 from agreement_acceptances where client_id = p_client_id) then
    raise exception 'This client has not accepted the agreement yet';
  end if;

  -- The client row and the login move together, under this function's own
  -- rights, so a manager's decision is not rejected by the profile guard.
  perform set_config('app.bypass_guard', 'on', true);
  update clients set status = v_status, approved_by = auth.uid(), approved_at = now()
  where id = p_client_id;
  if v_owner is not null then
    update profiles set status = v_status where id = v_owner;
  end if;
end $$;

revoke execute on function public.approve_client(uuid, boolean) from anon, public;
grant  execute on function public.approve_client(uuid, boolean) to authenticated;
