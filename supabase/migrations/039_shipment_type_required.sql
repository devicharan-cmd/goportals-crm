-- ============================================================
-- 039: Fixes a gap found reviewing 029-038 against lib/ticket-categories.ts —
--   "Shipment"'s shipment_type ("What do you need?") has been required:true
--   in the UI since it was introduced, but was never added to the DB's
--   required-keys list (it stayed in the empty case from 027). Enforce it
--   server-side too.
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
    when 'price_updation'        then array['update_type']
    when 'inventory_update'      then array['update_type', 'note']
    when 'ads_campaign'          then array[]::text[]
    when 'shipment'              then array['shipment_type']
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

  if new.category = 'price_updation' and coalesce(new.details->>'update_type', 'single') <> 'bulk' then
    select string_agg(k, ', ') into v_missing
    from unnest(array['sku', 'old_price', 'new_price']) k
    where not (new.details ? k) or trim(new.details->>k) = '';
    if v_missing is not null then
      raise exception 'Missing required field(s) for category %: %', new.category, v_missing;
    end if;
  end if;

  if new.category = 'inventory_update' and coalesce(new.details->>'update_type', 'single') <> 'bulk'
     and (not (new.details ? 'sku') or trim(new.details->>'sku') = '') then
    raise exception 'Missing required field(s) for category inventory_update: sku';
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
