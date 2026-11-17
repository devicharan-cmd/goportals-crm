-- The notification list filters by recipient and orders all read states by
-- created_at. The older recipient/is_read/created_at index cannot satisfy that
-- ordering because is_read is not constrained by the list query.
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
