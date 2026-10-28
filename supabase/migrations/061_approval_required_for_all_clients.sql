-- ============================================================
-- 061: Every client waits for approval, however they were added.
--
--   accept_agreement() used to activate the client itself whenever
--   signup_source <> 'self_signup' (017). Self-signup is switched off
--   (app/(auth)/signup redirects to /login), so every real client arrives
--   by invite or is created by staff — meaning nobody ever reached the
--   Approvals page and the super admin's approval step never ran.
--
--   Accepting the agreement now only records the acceptance. The client
--   stays 'pending' and lands on /pending until a super admin approves
--   them with approve_client(), which is unchanged.
--
--   Only the activation block is dropped; the rest of the function is a
--   copy of 017 so re-running this file is safe.
-- ============================================================

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

  -- No self-activation here: approval is the super admin's call.
  return v_client.status;
end $$;

revoke execute on function public.accept_agreement(uuid, text, text) from anon, public;
grant  execute on function public.accept_agreement(uuid, text, text) to authenticated;
