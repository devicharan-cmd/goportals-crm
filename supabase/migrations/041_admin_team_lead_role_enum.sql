-- ============================================================
-- 041: Add 'admin' and 'team_lead' to app_role. Enum values only —
--   nothing else in this file. Postgres cannot reference a newly added
--   enum value in the same transaction that creates it, so run this
--   alone and let it commit before running 042.
--
--   'manager' is retired going forward (replaced by 'admin' — see 042's
--   data migration) but stays in the enum forever; Postgres has no
--   DROP VALUE. It's a harmless unused legacy label after this lands.
-- ============================================================

alter type app_role add value if not exists 'admin';
alter type app_role add value if not exists 'team_lead';
