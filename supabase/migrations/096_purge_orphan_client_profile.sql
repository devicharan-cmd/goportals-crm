-- Remove personal data for an unlinked client account before deleting its Auth user.
-- Core tasks/tickets remain; authored comments, activity, attachments, time logs,
-- notifications, agreement records, memberships, and invitations are removed.
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
  delete from ticket_comments where author_id = p_profile_id;
  delete from task_activity where actor_id = p_profile_id;
  delete from ticket_activity where actor_id = p_profile_id;
  delete from task_attachments where uploaded_by = p_profile_id;
  delete from ticket_attachments where uploaded_by = p_profile_id;
  delete from time_logs where profile_id = p_profile_id;
  delete from agreement_acceptances where profile_id = p_profile_id;
  delete from notifications where recipient_id = p_profile_id;
  delete from department_members where profile_id = p_profile_id;
  delete from ticket_comment_reads where profile_id = p_profile_id;
  delete from invites where lower(email) = lower(v_email);
end;
$$;

revoke execute on function public.purge_orphan_client_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_orphan_client_profile(uuid, uuid) to service_role;
