-- Keep the user-management lookups fast as staff and invite history grows.
-- These indexes change no data or permissions; they only support existing
-- role filtering and the pending-invite sort used by /admin/users.

create index if not exists profiles_role_idx
  on public.profiles (role);

create index if not exists invites_pending_created_idx
  on public.invites (created_at desc)
  where used_at is null;

create index if not exists invites_reporting_to_idx
  on public.invites (reporting_to)
  where reporting_to is not null;
