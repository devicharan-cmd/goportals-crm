-- ============================================================
-- 033: "Report" gets two structured fields: report_scope (a specific
--   platform vs. all platforms) and report_type (sales / product wise /
--   campaign level / warehouse inventory) — see lib/ticket-categories.ts.
--   The e-commerce account is now only required when report_scope is
--   'platform' — relaxing the old table-level check (014) that always
--   required it for 'report' tickets.
-- Safe to re-run.
-- ============================================================

alter table tickets drop constraint if exists tickets_report_needs_account;
alter table tickets add constraint tickets_report_needs_account
  check (category <> 'report' or ecommerce_account_id is not null or details->>'report_scope' = 'all');

create or replace function public.guard_ticket_details() returns trigger
language plpgsql as $$
declare
  v_required text[];
  v_missing  text;
  v_desc_required boolean;
begin
  v_required := case new.category
    when 'new_listing'           then array[]::text[]  -- just description + optional note
    when 'active_product_change' then array['sku', 'change_type']  -- old_value/new_value removed (023)
    when 'price_updation'        then array['sku', 'old_price', 'new_price']
    when 'inventory_update'      then array['sku']
    when 'ads_campaign'          then array[]::text[]  -- request_type removed (026)
    when 'shipment'              then array[]::text[]  -- issue_type removed (027)
    when 'complaint'             then array['complaint_type']
    when 'new_expansion'         then array['platform_id']
    when 'report'                then array['report_scope', 'report_type']
    else array[]::text[]  -- 'other': subject + description (top-level columns) are enough
  end;

  select string_agg(k, ', ') into v_missing
  from unnest(v_required) k
  where not (new.details ? k) or trim(new.details->>k) = '';

  if v_missing is not null then
    raise exception 'Missing required field(s) for category %: %', new.category, v_missing;
  end if;

  v_desc_required := new.category in
    ('new_listing', 'active_product_change', 'price_updation', 'inventory_update',
     'ads_campaign', 'shipment', 'new_expansion', 'report', 'other');
  if v_desc_required and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required for this ticket category';
  end if;

  if new.category = 'complaint' and new.details->>'complaint_type' = 'team_member'
     and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required when a complaint is about a team member';
  end if;

  return new;
end $$;
