-- ============================================================
-- 036: Description removed from every category that has a Note field
--   (active_product_change, price_updation, inventory_update,
--   new_expansion — new_listing already dropped it in 035). Note
--   becomes required wherever it now carries information that used
--   to go in the description (active_product_change, inventory_update,
--   new_expansion); price_updation's note stays optional since
--   sku/old_price/new_price already cover the required details.
--   See lib/ticket-categories.ts.
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
    when 'new_listing'           then array['note']
    when 'active_product_change' then array['sku', 'change_type', 'note']
    when 'price_updation'        then array['sku', 'old_price', 'new_price']
    when 'inventory_update'      then array['sku', 'note']
    when 'ads_campaign'          then array[]::text[]  -- request_type removed (026)
    when 'shipment'              then array[]::text[]  -- issue_type removed (027)
    when 'complaint'             then array['complaint_type']
    when 'new_expansion'         then array['platform_id', 'note']
    when 'report'                then array['report_scope', 'report_type', 'duration']
    else array[]::text[]  -- 'other': subject + description (top-level columns) are enough
  end;

  select string_agg(k, ', ') into v_missing
  from unnest(v_required) k
  where not (new.details ? k) or trim(new.details->>k) = '';

  if v_missing is not null then
    raise exception 'Missing required field(s) for category %: %', new.category, v_missing;
  end if;

  v_desc_required := new.category in ('ads_campaign', 'shipment', 'report', 'other');
  if v_desc_required and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required for this ticket category';
  end if;

  if new.category = 'complaint' and new.details->>'complaint_type' = 'team_member'
     and (new.description is null or trim(new.description) = '') then
    raise exception 'Description is required when a complaint is about a team member';
  end if;

  return new;
end $$;
