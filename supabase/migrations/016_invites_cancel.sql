-- ============================================================
-- 016: Cancelled invites become a soft-cancel, not a hard delete, so a
--   cancelled invite still shows up in history instead of vanishing.
--   Status is never stored (it would just drift out of sync) — it's always
--   derived from the timestamps:
--     cancelled_at set  → cancelled
--     used_at set       → accepted
--     expires_at < now  → expired
--     else              → pending
-- Safe to re-run.
-- ============================================================

alter table invites add column if not exists cancelled_at timestamptz;

-- A cancelled invite must never be silently honoured by handle_new_user().
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
begin
  select * into inv from invites
  where lower(email) = lower(new.email)
    and used_at is null
    and cancelled_at is null
    and expires_at > now()
  order by created_at desc limit 1;

  if inv.id is not null then
    insert into profiles (id, email, full_name, role, status, signup_source, job_title)
    values (
      new.id, new.email,
      coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', ''),
      inv.role,
      case when inv.role = 'client' then 'pending' else 'active' end::account_status,
      case when inv.role = 'client'
           then (case when inv.client_id is null then 'invite' else 'admin_created' end)::signup_source
      end,
      inv.job_title
    );

    insert into department_members (department_id, profile_id)
    select unnest(inv.department_ids), new.id
    on conflict do nothing;

    if inv.role = 'client' and inv.client_id is not null then
      update clients set owner_id = new.id where id = inv.client_id and owner_id is null;
    end if;

    update invites set used_at = now(), used_by = new.id where id = inv.id;
  else
    insert into profiles (id, email, full_name, role, status, signup_source)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
            'client', 'pending', 'self_signup');
  end if;

  return new;
end $$;
