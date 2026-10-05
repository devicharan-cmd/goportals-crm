-- ============================================================
-- 050: Catch-up — migrations 021 through 039 (guard_ticket_details()'s
--   required-field list, progressively simplified/restructured to match
--   lib/ticket-categories.ts) were never applied to this database. Live
--   guard_ticket_details() was still on 014's original version (requiring
--   product_name/product_category/new_value/new_quantity/request_type/
--   issue_type/expansion_type/requirements/date_from/date_to — none of
--   which the current client-facing form sends), so every category except
--   'complaint' and 'other' was rejecting real ticket submissions.
--
--   This applies the end state of 021–039 directly — the exact body of
--   039 (the latest version) plus 033's one schema change (the
--   tickets_report_needs_account constraint, relaxed to only require an
--   e-commerce account when report_scope = 'platform') — rather than
--   replaying 19 superseded intermediate versions.
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
