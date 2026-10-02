-- ============================================================
-- 018: save_client_onboarding() also saves the address, entered during the
--   same step as basic company details. No signature change — address fields
--   just ride along in the existing p_company jsonb (old callers omitting
--   them still work fine, ->>'key' on a missing key is simply null).
-- Safe to re-run.
-- ============================================================

create or replace function public.save_client_onboarding(
  p_company          jsonb,     -- {company_name, gstin, contact_name, contact_email, contact_phone,
                                 --  address_line, city, state, postal_code, country,
                                 --  latitude, longitude, place_id, address_source}
  p_platform_ids     uuid[],
  p_service_ids      uuid[],
  p_custom_services  text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile   profiles%rowtype;
  v_client_id uuid;
  v_status    account_status;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'client' then
    raise exception 'Only client accounts can complete onboarding';
  end if;
  if length(trim(coalesce(p_company->>'company_name', ''))) = 0 then
    raise exception 'Company name is required';
  end if;

  select id, status into v_client_id, v_status from clients where owner_id = auth.uid();

  if v_client_id is null then
    insert into clients (company_name, gstin, contact_name, contact_email, contact_phone,
                         address_line, city, state, postal_code, country, latitude, longitude, place_id, address_source,
                         owner_id, status, signup_source, created_by)
    values (trim(p_company->>'company_name'),
            nullif(trim(p_company->>'gstin'), ''),
            coalesce(nullif(trim(p_company->>'contact_name'), ''), nullif(v_profile.full_name, '')),
            coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
            nullif(trim(p_company->>'contact_phone'), ''),
            nullif(trim(p_company->>'address_line'), ''),
            nullif(trim(p_company->>'city'), ''),
            nullif(trim(p_company->>'state'), ''),
            nullif(trim(p_company->>'postal_code'), ''),
            nullif(trim(p_company->>'country'), ''),
            nullif(p_company->>'latitude', '')::double precision,
            nullif(p_company->>'longitude', '')::double precision,
            nullif(trim(p_company->>'place_id'), ''),
            nullif(p_company->>'address_source', '')::address_input_method,
            auth.uid(), 'pending', coalesce(v_profile.signup_source, 'self_signup'), auth.uid())
    returning id into v_client_id;
  elsif v_status = 'pending' then
    update clients set
      company_name  = trim(p_company->>'company_name'),
      gstin         = nullif(trim(p_company->>'gstin'), ''),
      contact_name  = nullif(trim(p_company->>'contact_name'), ''),
      contact_email = coalesce(nullif(trim(p_company->>'contact_email'), ''), v_profile.email),
      contact_phone = nullif(trim(p_company->>'contact_phone'), ''),
      address_line  = nullif(trim(p_company->>'address_line'), ''),
      city          = nullif(trim(p_company->>'city'), ''),
      state         = nullif(trim(p_company->>'state'), ''),
      postal_code   = nullif(trim(p_company->>'postal_code'), ''),
      country       = nullif(trim(p_company->>'country'), ''),
      latitude      = nullif(p_company->>'latitude', '')::double precision,
      longitude     = nullif(p_company->>'longitude', '')::double precision,
      place_id      = nullif(trim(p_company->>'place_id'), ''),
      address_source = nullif(p_company->>'address_source', '')::address_input_method
    where id = v_client_id;
  else
    raise exception 'Your account is already set up — contact your account manager to change these details';
  end if;

  -- Platforms: replace the client's own self-selected accounts.
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

  -- Services: replace requested ones (active/stopped ones are managed by staff)
  -- Matches the partial unique index from migration 015 (plain (client_id, service_id)
  -- stopped being a real constraint once ecommerce_account_id-scoped pricing was added).
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
