-- ============================================================
-- 070: "Seen" marks on a ticket conversation.
--
--   A message now records when the other side actually read it, so the
--   author sees one tick for sent and two for seen, the way a chat does.
--
--   Honest about what it can know: there is no live connection to a
--   client's browser, so there is no separate "delivered" state. A message
--   is sent when it is stored, and seen when the other party opens that
--   ticket. Nothing else is inferred.
--
--   seen_at is set only by mark_ticket_messages_seen(), which marks the
--   messages the caller did NOT write, on a ticket the caller may see.
--   Nobody marks their own message as seen.
--
--   guard_comment_write() (009) applied its role rules on UPDATE as well as
--   INSERT, so an employee's read receipt would have rewritten a client's
--   public message into an internal note. Those rules now run on INSERT
--   only, which is where they were meant to apply.
-- Safe to re-run.
-- ============================================================

alter table ticket_comments add column if not exists seen_at timestamptz;

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
  end if;

  return new;
end $$;

create or replace function public.mark_ticket_messages_seen(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not can_see_ticket(p_ticket_id) then
    return;
  end if;

  update ticket_comments
     set seen_at = now()
   where ticket_id = p_ticket_id
     and author_id is distinct from v_uid
     and seen_at is null
     and not is_internal;
end $$;

revoke execute on function public.mark_ticket_messages_seen(uuid) from anon, public;
grant  execute on function public.mark_ticket_messages_seen(uuid) to authenticated;
