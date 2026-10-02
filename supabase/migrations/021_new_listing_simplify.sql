-- ============================================================
-- 021: Simplify the "New listing" ticket category — the client now
--   just writes a description + optional note and attaches files
--   (product_name/sku/asin/product_category/title/product_attributes
--   fields removed from the form, see lib/ticket-categories.ts). The
--   DB no longer requires those detail keys; description stays
--   required (unchanged, already in v_desc_required below).
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
    when 'new_listing'           then array[]::text[]  -- just description + optional note now
    when 'active_product_change' then array['sku', 'change_type', 'new_value']
    when 'price_updation'        then array['sku', 'new_price', 'currency']
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
    ('new_listing', 'active_product_change', 'ads_campaign', 'shipment', 'complaint', 'new_expansion', 'other');
  if v_desc_required and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required for this ticket category';
  end if;

  return new;
end $$;
