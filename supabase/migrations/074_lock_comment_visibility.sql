-- 074: A message's visibility is settled when it is written.
--
--   071 required every new ticket comment to go through send_ticket_comment(),
--   which refuses to let a team lead or employee write anything a client can
--   read. It closed INSERT only. The ticket_comments_update policy still
--   allowed any author who is_staff() to UPDATE their own row, and 070 had
--   moved the guard's role rules to INSERT, so nothing re-applied them:
--
--     1. employee sends an internal note   -> is_internal forced true
--     2. employee PATCHes their own row    -> is_internal := false
--     3. the note is now visible to the client
--
--   The body could be rewritten in the same call, so an innocuous note could
--   become any client-facing message.
--
--   is_internal and author_id are now fixed at insert. Editing the body is
--   still allowed, and seen_at still updates, so mark_ticket_messages_seen()
--   is unaffected. A BEFORE trigger runs ahead of the RLS WITH CHECK, so this
--   settles the value the policy then sees.
--
--   Applies to task_comments and ticket_comments, which share this trigger.
-- Safe to re-run.

create or replace function public.guard_comment_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role;
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    select role into v_role from profiles where id = auth.uid();
    if v_role = 'client' then
      new.is_internal := false;
    elsif v_role = 'employee' then
      new.is_internal := true;
    end if;
    return new;
  end if;

  if new.is_internal is distinct from old.is_internal then
    raise exception 'A message cannot be moved between internal and client-visible once sent';
  end if;
  if new.author_id is distinct from old.author_id then
    raise exception 'A message cannot change author';
  end if;

  return new;
end $$;
