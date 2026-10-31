-- Keep ticket message unread state per reader and only mark messages that
-- the current reader was actually allowed to receive as read.
-- Apply after migration 078_per_reader_message_receipts.sql.

create or replace function public.mark_ticket_messages_seen(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Compatibility stub: a ticket level request cannot safely mark messages
  -- read because it does not prove that each message was actually visible.
  return;
end;
$$;

create or replace function public.mark_ticket_message_seen(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket_id uuid;
begin
  if v_uid is null then
    return;
  end if;

  select c.ticket_id into v_ticket_id
  from ticket_comments c
  where c.id = p_comment_id
    and c.author_id is distinct from v_uid
    and not c.is_internal;

  if v_ticket_id is null or not can_see_ticket(v_ticket_id) then
    return;
  end if;

  if not exists (
    select 1 from ticket_comment_audience(p_comment_id) audience
    where audience.profile_id = v_uid
  ) then
    return;
  end if;

  insert into ticket_comment_reads (comment_id, profile_id)
  values (p_comment_id, v_uid)
  on conflict (comment_id, profile_id) do nothing;

end;
$$;

create or replace function public.my_unread_ticket_messages()
returns table (ticket_id uuid, unread integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.ticket_id, count(*)::int
  from ticket_comments c
  where auth.uid() is not null
    and not c.is_internal
    and c.author_id is distinct from auth.uid()
    and exists (
      select 1 from ticket_comment_audience(c.id) audience
      where audience.profile_id = auth.uid()
    )
    and not exists (
      select 1 from ticket_comment_reads r
      where r.comment_id = c.id and r.profile_id = auth.uid()
    )
  group by c.ticket_id;
$$;

revoke execute on function public.mark_ticket_messages_seen(uuid) from anon, public;
grant execute on function public.mark_ticket_messages_seen(uuid) to authenticated;
revoke execute on function public.mark_ticket_message_seen(uuid) from anon, public;
grant execute on function public.mark_ticket_message_seen(uuid) to authenticated;
revoke execute on function public.my_unread_ticket_messages() from anon, public;
grant execute on function public.my_unread_ticket_messages() to authenticated;
