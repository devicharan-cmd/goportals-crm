-- ============================================================
-- 059: Store each client's company profile image in a private Storage bucket.
--      The clients table keeps only the Storage object path, never image bytes.
-- Safe to re-run.
-- ============================================================

alter table public.clients
  add column if not exists company_profile_image_path text;

-- Clients may update only the fields in this allow-list. Keep the new path
-- within that same self-service boundary; commercial and ownership fields
-- remain protected as before.
create or replace function public.guard_client_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('app.bypass_guard', true) = 'on'
     or is_super_admin()
     or auth_role() = 'admin' then
    return new;
  end if;

  if auth_role() = 'client' then
    if old.owner_id is distinct from auth.uid() then
      raise exception 'You can only edit your own company';
    end if;
    if not only_changed(to_jsonb(old), to_jsonb(new), array[
      'company_name', 'gstin', 'contact_name', 'contact_email', 'contact_phone', 'whatsapp_group_link',
      'address_line', 'city', 'state', 'postal_code', 'country', 'latitude', 'longitude', 'place_id', 'address_source',
      'company_profile_image_path', 'updated_at'
    ]) then
      raise exception 'You can only change your company''s basic details, address and profile image';
    end if;
    return new;
  end if;

  if new.status        is distinct from old.status
  or new.owner_id      is distinct from old.owner_id
  or new.signup_source is distinct from old.signup_source
  or new.approved_by   is distinct from old.approved_by
  or new.approved_at   is distinct from old.approved_at then
    raise exception 'Only a super admin or admin can change account status, owner or approval';
  end if;
  return new;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-profile-images', 'client-profile-images', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists client_profile_images_select on storage.objects;
create policy client_profile_images_select on storage.objects for select to authenticated
  using (bucket_id = 'client-profile-images'
         and can_see_client(try_uuid((storage.foldername(name))[1])));

drop policy if exists client_profile_images_insert on storage.objects;
create policy client_profile_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-profile-images'
    and auth_role() = 'client'
    and exists (
      select 1 from public.clients c
      where c.id = try_uuid((storage.foldername(name))[1])
        and c.owner_id = auth.uid()
    )
  );

-- Upsert replaces the one stable object at {client_id}/company-profile.
-- Storage evaluates UPDATE policies when that object already exists.
drop policy if exists client_profile_images_update on storage.objects;
create policy client_profile_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'client-profile-images'
    and auth_role() = 'client'
    and exists (
      select 1 from public.clients c
      where c.id = try_uuid((storage.foldername(name))[1])
        and c.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'client-profile-images'
    and auth_role() = 'client'
    and exists (
      select 1 from public.clients c
      where c.id = try_uuid((storage.foldername(name))[1])
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists client_profile_images_delete on storage.objects;
create policy client_profile_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'client-profile-images'
    and (is_super_admin() or (
      auth_role() = 'client'
      and exists (
        select 1 from public.clients c
        where c.id = try_uuid((storage.foldername(name))[1])
          and c.owner_id = auth.uid()
      )
    ))
  );
