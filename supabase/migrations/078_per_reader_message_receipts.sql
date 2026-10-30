-- 078: "Seen" has to mean seen by the person it was for.
--
--   A message carried one seen_at, set by whoever opened the ticket first. On
--   a client conversation several people may read a client's message -- every
--   Manager and the Super Admin -- so the first of them to open it marked it
--   seen for all of them. The client was told "Seen" when the Super Admin had
--   not looked, and a Manager opening a ticket cleared the unread count on
--   everybody else's list.
--
--   Reading is now recorded per person, so both the receipt and the unread
--   count answer for one reader instead of for the first one.
--
--   ticket_comment_audience() names who a message was actually for: a client's
--   message is for the Managers and Super Admins who may answer it, and a
--   staff reply is for the client who owns the ticket. Internal notes have no
--   audience -- they carry no receipt.
-- Safe to re-run.

create table if not exists ticket_comment_reads (
  comment_id uuid not null references ticket_comments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);

alter table ticket_comment_reads enable row level security;

drop policy if exists ticket_comment_reads_select on ticket_comment_reads;
create policy ticket_comment_reads_select on ticket_comment_reads for select to authenticated
  using (exists (select 1 from ticket_comments c where c.id = comment_id and can_see_ticket(c.ticket_id)));

-- Rows are written only by mark_ticket_messages_seen(), so nobody can claim to
-- have read something, or claim somebody else has.
drop policy if exists ticket_comment_reads_insert on ticket_comment_reads;
create policy ticket_comment_reads_insert on ticket_comment_reads for insert to authenticated with check (false);
drop policy if exists ticket_comment_reads_update on ticket_comment_reads;
create policy ticket_comment_reads_update on ticket_comment_reads for update to authenticated using (false);
drop policy if exists ticket_comment_reads_delete on ticket_comment_reads;
create policy ticket_comment_reads_delete on ticket_comment_reads for delete to authenticated using (false);

create or replace function public.ticket_comment_audience(p_comment_id uuid)
returns table (profile_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id
  from ticket_comments c
  join tickets t on t.id = c.ticket_id
  cross join lateral (select role = 'client' as from_client from profiles where id = c.author_id) a
  join profiles p on p.status = 'active' and p.id is distinct from c.author_id
  where c.id = p_comment_id
    and not c.is_internal
    and case when a.from_client
             then p.role in ('super_admin', 'admin')
             else p.id = (select owner_id from clients where id = t.client_id)
        end
$$;

create or replace function public.mark_ticket_messages_seen(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role := auth_role();
begin
  if v_uid is null or not can_see_ticket(p_ticket_id) then
    return;
  end if;

  insert into ticket_comment_reads (comment_id, profile_id)
  select c.id, v_uid
  from ticket_comments c
  where c.ticket_id = p_ticket_id
    and c.author_id is distinct from v_uid
    and (not c.is_internal or v_role in ('super_admin', 'admin', 'team_lead', 'employee'))
  on conflict do nothing;

  -- Kept as "first read", so anything still reading the old column behaves.
  update ticket_comments
     set seen_at = now()
   where ticket_id = p_ticket_id
     and author_id is distinct from v_uid
     and seen_at is null
     and not is_internal;
end $$;

-- What the author is told: how many of the people it was for have read it.
create or replace function public.ticket_message_receipts(p_ticket_id uuid)
returns table (comment_id uuid, audience integer, seen integer)
language sql stable security definer set search_path = public as $$
  select c.id,
         (select count(*)::int from ticket_comment_audience(c.id)),
         (select count(*)::int from ticket_comment_reads r
           where r.comment_id = c.id
             and r.profile_id in (select profile_id from ticket_comment_audience(c.id)))
  from ticket_comments c
  where c.ticket_id = p_ticket_id
    and not c.is_internal
    and can_see_ticket(p_ticket_id)
$$;

revoke execute on function public.ticket_comment_audience(uuid) from anon, public;
grant  execute on function public.ticket_comment_audience(uuid) to authenticated;
revoke execute on function public.ticket_message_receipts(uuid) from anon, public;
grant  execute on function public.ticket_message_receipts(uuid) to authenticated;

-- One reader's unread count per ticket, for the chat icon on both lists.
create or replace function public.my_unread_ticket_messages()
returns table (ticket_id uuid, unread integer)
language sql stable security definer set search_path = public as $$
  select c.ticket_id, count(*)::int
  from ticket_comments c
  where auth.uid() is not null
    and c.author_id is distinct from auth.uid()
    and auth.uid() in (select profile_id from ticket_comment_audience(c.id))
    and not exists (select 1 from ticket_comment_reads r
                     where r.comment_id = c.id and r.profile_id = auth.uid())
  group by c.ticket_id
$$;

-- Who a message was for, and which of them have read it.
create or replace function public.ticket_message_readers(p_comment_id uuid)
returns table (profile_id uuid, full_name text, email text, role app_role, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.profile_id,
         coalesce(nullif(p.full_name, ''), case when p.role = 'super_admin' then 'Super Admin' when p.role = 'admin' then 'Manager' else p.email end) as full_name,
         p.email, p.role, r.read_at
  from ticket_comment_audience(p_comment_id) a
  join profiles p on p.id = a.profile_id
  left join ticket_comment_reads r on r.comment_id = p_comment_id and r.profile_id = a.profile_id
  where exists (select 1 from ticket_comments c
                 where c.id = p_comment_id and can_see_ticket(c.ticket_id))
  order by p.role = 'super_admin' desc, p.role = 'admin' desc, p.full_name;
$$;

revoke execute on function public.my_unread_ticket_messages() from anon, public;
grant  execute on function public.my_unread_ticket_messages() to authenticated;
revoke execute on function public.ticket_message_readers(uuid) from anon, public;
grant  execute on function public.ticket_message_readers(uuid) to authenticated;
