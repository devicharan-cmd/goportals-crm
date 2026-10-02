-- ============================================================
-- 030: "Inventory update" fields now mirror "Price update" minus the
--   price itself: sku is required again (asin stays optional), plus
--   optional drive_link/note — see lib/ticket-categories.ts.
--   current_quantity/new_quantity/effective_date/reason stay removed
--   (025) — captured in the description instead.
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
    when 'price_updation'        then array['sku', 'old_price', 'new_price']
    when 'inventory_update'      then array['sku']
    when 'ads_campaign'          then array[]::text[]  -- request_type removed (026)
    when 'shipment'              then array[]::text[]  -- issue_type removed (027)
    when 'complaint'             then array['complaint_type']
    when 'new_expansion'         then array[]::text[]  -- expansion_type/requirements removed (027)
    when 'report'                then array[]::text[]  -- report_type/date_from/date_to/format removed
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

  return new;
end $$;
