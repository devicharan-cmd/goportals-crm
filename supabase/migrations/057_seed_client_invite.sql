-- ============================================================
-- 057: Seed one client-role invite against an existing seed client
--   (049's 'Ananta Foods (seed)'), so there's a client login to test the
--   portal/reopen flow with — same pattern as 051/052 for staff: this
--   ONLY writes an `invites` row. The matching profile/auth link only
--   happens once someone actually creates that auth user (handle_new_user,
--   002/016, fires on any auth.users insert — Dashboard "Add user" works
--   just as well as the in-app invite email).
-- Safe to re-run: skips if the invite already exists.
-- ============================================================

do $$
declare
  v_client uuid := (select id from clients where company_name = 'Ananta Foods (seed)');
  v_admin  uuid := (select id from profiles where role = 'super_admin' order by created_at limit 1);
begin
  if v_client is null then
    raise notice 'Seed client "Ananta Foods (seed)" not found — run 049 first. Skipping.';
    return;
  end if;
  if exists (select 1 from invites where lower(email) = 'rohit.sharma@ananta.test') then
    raise notice 'Client invite seed already applied — skipping.';
    return;
  end if;

  insert into invites (email, role, full_name, client_id, invited_by) values
    ('rohit.sharma@ananta.test', 'client', 'Rohit Sharma', v_client, v_admin);

  raise notice 'Seeded 1 client invite against Ananta Foods (seed). Becomes a real login once that auth user is created.';
end $$;
