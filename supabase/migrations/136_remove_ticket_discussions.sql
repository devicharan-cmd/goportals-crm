-- Remove ticket-only threaded comments and read receipts. Ticket attachments,
-- ticket activity, and task discussions remain available.

drop function if exists public.ticket_message_readers(uuid);
drop function if exists public.ticket_message_receipts(uuid);
drop function if exists public.my_unread_ticket_messages();
drop function if exists public.mark_ticket_message_seen(uuid);
drop function if exists public.mark_ticket_messages_seen(uuid);
drop function if exists public.ticket_comment_audience(uuid);
drop function if exists public.send_ticket_comment(uuid, text, boolean);

do $$
begin
  if to_regclass('public.ticket_comments') is not null then
    execute 'drop trigger if exists ticket_comments_notify on public.ticket_comments';
  end if;
end
$$;
drop function if exists public.notify_ticket_comment();

do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) then
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'ticket_comments'
    ) then
      execute 'alter publication supabase_realtime drop table public.ticket_comments';
    end if;
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'ticket_comment_reads'
    ) then
      execute 'alter publication supabase_realtime drop table public.ticket_comment_reads';
    end if;
  end if;
end
$$;

delete from public.notifications
where type = 'comment'
  and ticket_id is not null;

create or replace function public.purge_orphan_client_profile(
  p_profile_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not exists (
    select 1 from profiles
    where id = p_actor_id and role = 'super_admin' and status = 'active'
  ) then
    raise exception 'Only an active super admin can delete an account';
  end if;

  if p_profile_id = p_actor_id then
    raise exception 'You cannot delete your own account';
  end if;

  select email into v_email
  from profiles
  where id = p_profile_id and role = 'client';

  if not found then
    raise exception 'Unlinked client account not found';
  end if;

  if exists (select 1 from clients where owner_id = p_profile_id) then
    raise exception 'This account owns a client and cannot be deleted here';
  end if;

  delete from task_comments where author_id = p_profile_id;
  delete from task_activity where actor_id = p_profile_id;
  delete from ticket_activity where actor_id = p_profile_id;
  delete from task_attachments where uploaded_by = p_profile_id;
  delete from ticket_attachments where uploaded_by = p_profile_id;
  delete from time_logs where profile_id = p_profile_id;
  delete from agreement_acceptances where profile_id = p_profile_id;
  delete from notifications where recipient_id = p_profile_id;
  delete from department_members where profile_id = p_profile_id;
  delete from invites where lower(email) = lower(v_email);
end;
$$;

revoke execute on function public.purge_orphan_client_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_orphan_client_profile(uuid, uuid) to service_role;

drop function if exists public.reopen_ticket(uuid, text);

create or replace function public.reopen_ticket(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_client uuid;
  v_status public.ticket_status;
  v_reopened integer;
begin
  select client_id, status into v_client, v_status
    from public.tickets
   where id = p_ticket_id
   for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_status <> 'closed' then
    raise exception 'Only a closed ticket can be reopened';
  end if;
  if v_role in ('super_admin', 'admin') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    null;
  else
    raise exception 'Only the client or an admin can request changes';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.tickets set status = 'assigned' where id = p_ticket_id;
  update public.tasks
     set status = 'changes_requested'
   where ticket_id = p_ticket_id and status = 'completed';
  get diagnostics v_reopened = row_count;
  if v_reopened = 0 then
    raise exception 'This ticket has no completed tasks to reopen';
  end if;
end
$$;

revoke execute on function public.reopen_ticket(uuid) from anon, public;
grant execute on function public.reopen_ticket(uuid) to authenticated;

drop table if exists public.ticket_comment_reads;
drop table if exists public.ticket_comments;
