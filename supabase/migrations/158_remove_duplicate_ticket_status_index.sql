-- Migration 130 and migration 138 create equivalent status/order indexes.
-- Keep tickets_status_summary_idx (created by 138) and remove the duplicate.
drop index if exists public.tickets_status_created_id_page_idx;
