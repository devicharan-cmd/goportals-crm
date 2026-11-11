-- Add workflow stages before any function or application code uses them.
-- Apply this migration separately before 104.
alter type public.task_status add value if not exists 'in_system_process' after 'in_progress';
alter type public.task_status add value if not exists 'client_review' after 'ready_for_review';
