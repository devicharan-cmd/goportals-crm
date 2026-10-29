-- ============================================================
-- 067: Approval decisions belong to the super admin alone.
--
--   approve_client() and set_client_status() accepted 'admin' (Manager)
--   as well. Policy has changed: onboarding approval, rejection and any
--   account suspension / reactivation are the super admin's call, so the
--   checks narrow to is_super_admin(). The UI hides these controls from
--   managers; this is what stops a direct API call.
--
--   Nothing else about the functions changes — approving still requires an
--   accepted agreement, and both the client row and the login still move
--   together under the guard bypass (065).
--
--   agreement_acceptances stays readable by managers (066): seeing whether
--   a client has signed is information they need on the client page, not
--   an approval power.
-- Safe to re-run.
-- ============================================================

create or replace function public.approve_client(p_client_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_status account_status := case when p_approve then 'active' else 'rejected' end;
begin
  if not is_super_admin() then
    raise exception 'Only a super admin can approve or reject a client';
  end if;
  select owner_id into v_owner from clients where id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;
  if p_approve and not exists (select 1 from agreement_acceptances where client_id = p_client_id) then
    raise exception 'This client has not accepted the agreement yet';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update clients set status = v_status, approved_by = auth.uid(), approved_at = now()
  where id = p_client_id;
  if v_owner is not null then
    update profiles set status = v_status where id = v_owner;
  end if;
end $$;

create or replace function public.set_client_status(p_client_id uuid, p_status account_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if not is_super_admin() then
    raise exception 'Only a super admin can change a client''s account status';
  end if;

  select owner_id into v_owner from clients where id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update clients set status = p_status where id = p_client_id;
  if v_owner is not null then
    update profiles set status = p_status where id = v_owner;
  end if;
end $$;

revoke execute on function public.approve_client(uuid, boolean)                from anon, public;
revoke execute on function public.set_client_status(uuid, account_status)      from anon, public;
grant  execute on function public.approve_client(uuid, boolean)                to authenticated;
grant  execute on function public.set_client_status(uuid, account_status)      to authenticated;

-- ─── Close the direct-write route ───────────────────────────
--   guard_client_update() (042) let 'admin' past every column check, so a
--   manager could still PATCH clients.status straight through PostgREST
--   and skip the RPC entirely. Managers now fall through to the same
--   restricted-column check as other staff: they keep full editing of a
--   client's details and lose only status / owner / approval columns.
create or replace function public.guard_client_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin() then
    return new;
  end if;

  if auth_role() = 'client' then
    if old.owner_id is distinct from auth.uid() then
      raise exception 'You can only edit your own company';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new), array[
      'company_name', 'gstin', 'contact_name', 'contact_email', 'contact_phone', 'whatsapp_group_link',
      'address_line', 'city', 'state', 'postal_code', 'country', 'latitude', 'longitude', 'place_id', 'address_source',
      'updated_at'
    ]) then
      raise exception 'You can only change your company''s basic details and address';
    end if;
    return new;
  end if;

  if new.status        is distinct from old.status
  or new.owner_id      is distinct from old.owner_id
  or new.signup_source is distinct from old.signup_source
  or new.approved_by   is distinct from old.approved_by
  or new.approved_at   is distinct from old.approved_at then
    raise exception 'Only a super admin can change account status, owner or approval';
  end if;
  return new;
end $$;
