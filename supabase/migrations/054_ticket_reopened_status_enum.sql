-- ============================================================
-- 054: Add 'reopened' to ticket_status. Enum value only — nothing else in
--   this file. Postgres cannot reference a newly added enum value in the
--   same transaction that creates it, so run this alone and let it commit
--   before running 055 (same restriction migration 041 already hit when
--   adding 'admin'/'team_lead' to app_role).
--
--   Used by the new reopen_ticket() RPC (055): when a client rejects a
--    'resolved' ticket, it's written here as a visibility marker ("the
--   client sent this back"), not a new node in the status machine — the
--   existing auto-progress trigger (047) already recomputes
--   resolved <-> in_progress from linked-task state on its own, so
--   'reopened' just needs to be the value reopen_ticket() writes after
--   that cascade runs; it falls back to 'in_progress'/'resolved' the
--   moment the reworked task's status changes again, same as today.
-- ============================================================

alter type ticket_status add value if not exists 'reopened' after 'resolved';
