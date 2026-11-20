-- Staff remain pending until complete_invite_setup() records the accepted
-- invitation after password setup. Manual status changes are only suspension
-- and reactivation of existing staff; client approval keeps its own workflow.
create or replace function public.protect_staff_invitation_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role::text = 'client' or new.role::text = 'client'
     or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'pending' then
    if new.status <> 'active' or not exists (
      select 1
      from public.invites i
      where i.used_by = old.id
        and i.used_at is not null
        and i.cancelled_at is null
    ) then
      raise exception 'Staff invitations become active only after password setup';
    end if;
  elsif old.status not in ('active', 'suspended')
     or new.status not in ('active', 'suspended') then
    raise exception 'Only active and suspended staff statuses can be changed manually';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_staff_invitation_status on public.profiles;
create trigger profiles_protect_staff_invitation_status
  before update on public.profiles
  for each row execute function public.protect_staff_invitation_status();

-- Pending clients enter Active or Rejected through the approval action, which
-- records the decision and checks the accepted agreement. Later manual changes
-- can suspend/reactivate, or return a client to Pending for another review.
create or replace function public.approve_client(p_client_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_current_status account_status;
  v_status account_status := case when p_approve then 'active' else 'rejected' end;
begin
  if not is_super_admin() then
    raise exception 'Only a super admin can approve or reject a client';
  end if;

  select owner_id, status into v_owner, v_current_status
  from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client not found';
  end if;
  if v_current_status <> 'pending' then
    raise exception 'Only a pending client can be approved or rejected';
  end if;
  if p_approve and not exists (
    select 1 from public.agreement_acceptances where client_id = p_client_id
  ) then
    raise exception 'This client has not accepted the agreement yet';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.clients
  set status = v_status, approved_by = auth.uid(), approved_at = now()
  where id = p_client_id;
  if v_owner is not null then
    update public.profiles set status = v_status where id = v_owner;
  end if;
end $$;

create or replace function public.set_client_status(p_client_id uuid, p_status account_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_current_status account_status;
begin
  if not is_super_admin() then
    raise exception 'Only a super admin can change a client''s account status';
  end if;

  select owner_id, status into v_owner, v_current_status
  from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client not found';
  end if;
  if p_status = 'rejected'
     or (v_current_status = 'pending' and p_status <> 'pending')
     or (v_current_status = 'rejected' and p_status not in ('rejected', 'pending')) then
    raise exception 'Use client approval for pending accounts; return a rejected client to Pending before another review';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update public.clients set status = p_status where id = p_client_id;
  if v_owner is not null then
    update public.profiles set status = p_status where id = v_owner;
  end if;
end $$;

revoke execute on function public.approve_client(uuid, boolean) from anon, public;
revoke execute on function public.set_client_status(uuid, account_status) from anon, public;
grant execute on function public.approve_client(uuid, boolean) to authenticated;
grant execute on function public.set_client_status(uuid, account_status) to authenticated;
