-- 072: Add the distinct ticket stage between employee work and resolution.
-- This is separate from task_status.ready_for_review: the parent ticket enters
-- this stage when all non-cancelled tasks are ready for review or completed.
alter type ticket_status add value if not exists 'ready_for_review' after 'in_progress';
