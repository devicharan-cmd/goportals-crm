-- ============================================================
-- 017: Client self-service profile + address, and a durable record of what
--   commercial terms an agreement acceptance actually covered.
--
--   Flow this supports:
--     admin/super_admin creates client → sets ecommerce_accounts + client_services
--     (with agreed_price) at creation time → client is invited, logs in, fills in
--     their own basic details + address → sees the current agreement together
--     with the accounts/services/prices already assigned to them → accepts →
--     status becomes active → dashboard.
--   Afterwards the client can only ever edit their own basic details + address —
--   never accounts, services or price (those tables already deny client writes
--   entirely via RLS; this migration only opens a narrow, allow-listed self-edit
--   path on `clients` itself, enforced in the DB, not just hidden in the UI).
-- Safe to re-run.
-- ============================================================

-- ─── Address: map-picked or manually typed ───────────────────
do $$ begin
  create type address_input_method as enum ('map', 'manual');
exception when duplicate_object then null; end $$;

alter table clients
  add column if not exists address_line   text,
  add column if not exists city           text,
  add column if not exists state          text,
  add column if not exists postal_code    text,
  add column if not exists country        text default 'India',
  add column if not exists latitude       double precision,
  add column if not exists longitude      double precision,
  add column if not exists place_id       text,             -- Google Place ID, when picked from the map
  add column if not exists address_source address_input_method;

do $$ begin
  alter table clients add constraint clients_latitude_range check (latitude is null or latitude between -90 and 90);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table clients add constraint clients_longitude_range check (longitude is null or longitude between -180 and 180);
exception when duplicate_object then null; end $$;

-- A map-picked address must carry real coordinates; a manually typed one doesn't have to.
do $$ begin
  alter table clients add constraint clients_map_needs_coords check (
    address_source is distinct from 'map' or (latitude is not null and longitude is not null)
  );
exception when duplicate_object then null; end $$;

-- ─── Client can edit their own basic details + address, nothing commercial ─
drop policy if exists clients_update on clients;
create policy clients_update on clients for update to authenticated
  using (is_super_admin() or manager_covers_client(id) or (auth_role() = 'client' and owner_id = auth.uid()))
  with check (true);  -- column-level enforcement in guard_client_update

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

-- ─── Agreement acceptance: freeze what was actually shown ────
-- client_services.agreed_price already never gets silently rewritten (015), so this
-- is redundant for normal operation — it exists for the case an admin later
-- renegotiates a price: the original signed record must still show the old terms.
alter table agreement_acceptances add column if not exists terms_snapshot jsonb not null default '{}';

create or replace function public.accept_agreement(
  p_agreement_id uuid, p_ip text default null, p_user_agent text default null
) returns account_status
language plpgsql security definer set search_path = public as $$
declare
  v_client   clients%rowtype;
  v_snapshot jsonb;
begin
  select * into v_client from clients where owner_id = auth.uid();
  if v_client.id is null then
    raise exception 'Please complete your company details first';
  end if;
  if not exists (select 1 from agreements where id = p_agreement_id and is_current) then
    raise exception 'This agreement version is no longer current — please reload the page';
  end if;

  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', p.name, 'account_name', ea.account_name, 'status', ea.status
      ))
      from ecommerce_accounts ea join platforms p on p.id = ea.platform_id
      where ea.client_id = v_client.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service', coalesce(s.name, cs.custom_name),
        'ecommerce_account', ea.account_name,
        'agreed_price', cs.agreed_price,
        'currency', cs.currency,
        'billing_type', cs.billing_type
      ))
      from client_services cs
      left join services s on s.id = cs.service_id
      left join ecommerce_accounts ea on ea.id = cs.ecommerce_account_id
      where cs.client_id = v_client.id and cs.status <> 'stopped'
    ), '[]'::jsonb)
  ) into v_snapshot;

  insert into agreement_acceptances (client_id, profile_id, agreement_id, ip, user_agent, terms_snapshot)
  values (v_client.id, auth.uid(), p_agreement_id, p_ip, p_user_agent, v_snapshot)
  on conflict (profile_id, agreement_id) do nothing;

  if v_client.signup_source <> 'self_signup' and v_client.status = 'pending' then
    perform set_config('app.bypass_guard', 'on', true);
    update clients  set status = 'active' where id = v_client.id;
    update profiles set status = 'active' where id = auth.uid() and status = 'pending';
    return 'active';
  end if;

  return v_client.status;
end $$;
