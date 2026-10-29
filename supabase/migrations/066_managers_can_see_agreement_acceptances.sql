-- ============================================================
-- 066: A manager must be able to see that a client signed.
--
--   agreement_acceptances_select (003) allows only the super admin and the
--   client themselves. Migration 043 widened the other client-facing
--   policies to 'admin' and missed this one, so for a manager the
--   Approvals page always reported "Not yet accepted" and kept the Approve
--   button disabled — no matter what the client had signed.
--
--   Together with 065 this is why a manager could never approve anyone:
--   the button was disabled, and the call behind it was refused.
--
--   Read-only widening; nobody gains the ability to write an acceptance,
--   and clients still see only their own.
-- Safe to re-run.
-- ============================================================

drop policy if exists agreement_acceptances_select on agreement_acceptances;
create policy agreement_acceptances_select on agreement_acceptances for select to authenticated
  using (is_super_admin() or auth_role() = 'admin' or profile_id = auth.uid());
