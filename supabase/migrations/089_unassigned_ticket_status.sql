-- Add the first value in the simplified ticket status set.
-- Keep this enum change isolated so the new value is committed before use.
alter type public.ticket_status
  add value if not exists 'unassigned' before 'assigned';
