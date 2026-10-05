-- ============================================================
-- 026: "Ads & campaign" is now just Subject + Description (describe
--   your work) — campaign_name/campaign_id/request_type/budget/
--   targeting_details/date_range removed from the form, see
--   lib/ticket-categories.ts. Description was already required.
-- Safe to re-run.
-- ============================================================

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
    when 'price_updation'        then array[]::text[]  -- sku/new_price/currency/etc. removed (024)
    when 'inventory_update'      then array[]::text[]  -- sku/new_quantity now optional (025)
    when 'ads_campaign'          then array[]::text[]  -- request_type removed
    when 'shipment'              then array['issue_type']
    when 'complaint'             then array['complaint_type']
    when 'new_expansion'         then array['expansion_type', 'requirements']
    when 'report'                then array['report_type', 'date_from', 'date_to']
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
     'ads_campaign', 'shipment', 'new_expansion', 'other');
  if v_desc_required and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required for this ticket category';
  end if;

  return new;
end $$;
