-- ============================================================
-- 024: "Price update" is now just Subject + Description — all detail
--   fields (sku, asin, current_price, new_price, currency,
--   effective_date, reason) removed from the form, see
--   lib/ticket-categories.ts. Description becomes required since it's
--   the only place left to say what's changing.
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
    when 'price_updation'        then array[]::text[]  -- sku/new_price/currency/etc. removed
    when 'inventory_update'      then array['sku', 'new_quantity']
    when 'ads_campaign'          then array['request_type']
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
    ('new_listing', 'active_product_change', 'price_updation', 'ads_campaign', 'shipment', 'new_expansion', 'other');
  if v_desc_required and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required for this ticket category';
  end if;

  return new;
end $$;
