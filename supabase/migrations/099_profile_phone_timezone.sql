-- ============================================================
-- 099: international mobile numbers and timezone on staff/client profiles
-- Run manually in the Supabase SQL editor after this migration is committed.
-- ============================================================

alter table public.profiles
  add column if not exists timezone text;

alter table public.clients
  add column if not exists timezone text;

update public.profiles
set timezone = coalesce(timezone, 'Asia/Kolkata')
where timezone is null;

update public.clients
set timezone = coalesce(timezone, 'Asia/Kolkata')
where timezone is null;

alter table public.profiles alter column timezone set default 'Asia/Kolkata';
alter table public.clients alter column timezone set default 'Asia/Kolkata';

-- Existing databases can contain locally formatted or placeholder phone values.
-- Clear values that cannot satisfy E.164 so the migration can add the durable
-- constraint without failing. Users must enter a valid value when they edit.
update public.profiles
set phone = null
where phone is not null
  and btrim(phone) !~ '^\+[1-9][0-9]{7,14}$';

update public.clients
set contact_phone = null
where contact_phone is not null
  and btrim(contact_phone) !~ '^\+[1-9][0-9]{7,14}$';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_phone_e164_check'
  ) then
    alter table public.profiles add constraint profiles_phone_e164_check
      check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'clients_contact_phone_e164_check'
  ) then
    alter table public.clients add constraint clients_contact_phone_e164_check
      check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end $$;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin() then
    return new;
  end if;

  if not only_changed(to_jsonb(old), to_jsonb(new),
                      array['full_name', 'phone', 'timezone', 'avatar_url', 'updated_at']) then
    raise exception 'Only a super admin can change role, status, email, capacity or timezone';
  end if;
  return new;
end $$;

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
      'company_name', 'gstin', 'contact_name', 'contact_email', 'contact_phone', 'timezone',
      'whatsapp_group_link', 'address_line', 'city', 'state', 'postal_code', 'country',
      'latitude', 'longitude', 'place_id', 'address_source', 'updated_at'
    ]) then
      raise exception 'You can only change your company''s basic details, address and timezone';
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

create or replace function public.save_client_onboarding(
  p_company jsonb, p_platform_ids uuid[], p_service_ids uuid[], p_custom_services text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles%rowtype;
  v_client_id uuid;
  v_status account_status;
  v_phone text;
  v_timezone text;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'client' then
    raise exception 'Only client accounts can complete onboarding';
  end if;
  if length(trim(coalesce(p_company->>'company_name', ''))) = 0 then
    raise exception 'Company name is required';
  end if;

  v_phone := nullif(trim(p_company->>'contact_phone'), '');
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A valid mobile number is required';
  end if;
  v_timezone := coalesce(nullif(trim(p_company->>'timezone'), ''), 'Asia/Kolkata');

  select id, status into v_client_id, v_status from clients where owner_id = auth.uid();

  if v_client_id is null then
    insert into clients (
      company_name, gstin, contact_name, contact_email, contact_phone, timezone,
      address_line, city, state, postal_code, country, latitude, longitude, place_id, address_source,
      owner_id, status, signup_source, created_by
    ) values (
      trim(p_company->>'company_name'), nullif(trim(p_company->>'gstin'), ''),
      coalesce(nullif(trim(p_company->>'contact_name'), ''), nullif(v_profile.full_name, '')),
      coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
      v_phone, v_timezone,
      nullif(trim(p_company->>'address_line'), ''), nullif(trim(p_company->>'city'), ''),
      nullif(trim(p_company->>'state'), ''), nullif(trim(p_company->>'postal_code'), ''),
      nullif(trim(p_company->>'country'), ''),
      nullif(p_company->>'latitude', '')::double precision,
      nullif(p_company->>'longitude', '')::double precision,
      nullif(trim(p_company->>'place_id'), ''),
      nullif(p_company->>'address_source', '')::address_input_method,
      auth.uid(), 'pending', coalesce(v_profile.signup_source, 'self_signup'), auth.uid()
    ) returning id into v_client_id;
  elsif v_status = 'pending' then
    update clients set
      company_name = trim(p_company->>'company_name'),
      gstin = nullif(trim(p_company->>'gstin'), ''),
      contact_name = nullif(trim(p_company->>'contact_name'), ''),
      contact_email = coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
      contact_phone = v_phone,
      timezone = v_timezone,
      address_line = nullif(trim(p_company->>'address_line'), ''),
      city = nullif(trim(p_company->>'city'), ''),
      state = nullif(trim(p_company->>'state'), ''),
      postal_code = nullif(trim(p_company->>'postal_code'), ''),
      country = nullif(trim(p_company->>'country'), ''),
      latitude = nullif(p_company->>'latitude', '')::double precision,
      longitude = nullif(p_company->>'longitude', '')::double precision,
      place_id = nullif(trim(p_company->>'place_id'), ''),
      address_source = nullif(p_company->>'address_source', '')::address_input_method
    where id = v_client_id;
  else
    raise exception 'Your account is already set up — contact your account manager to change these details';
  end if;

  delete from ecommerce_accounts
  where client_id = v_client_id
    and created_by = auth.uid()
    and not (platform_id = any (coalesce(p_platform_ids, '{}')));

  insert into ecommerce_accounts (client_id, platform_id, account_name, created_by)
  select v_client_id, p.id, p.name, auth.uid() from platforms p
  where p.is_active and p.id = any (coalesce(p_platform_ids, '{}'))
    and not exists (
      select 1 from ecommerce_accounts ea
      where ea.client_id = v_client_id and ea.platform_id = p.id
    );

  delete from client_services where client_id = v_client_id and status = 'requested';
  insert into client_services (client_id, service_id)
  select v_client_id, s.id from services s
  where s.is_active and s.id = any (coalesce(p_service_ids, '{}'))
  on conflict (client_id, service_id) where ecommerce_account_id is null do nothing;
  insert into client_services (client_id, custom_name)
  select v_client_id, trim(c) from unnest(coalesce(p_custom_services, '{}')) c
  where length(trim(c)) > 0;

  return v_client_id;
end $$;
