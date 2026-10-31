-- Store staff profile photos in a public Storage bucket. The profiles table
-- keeps the public URL in its existing avatar_url column.
-- Safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-profile-images', 'staff-profile-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists staff_profile_images_insert on storage.objects;
create policy staff_profile_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'staff-profile-images'
    and auth_role() in ('super_admin', 'admin', 'team_lead', 'employee')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists staff_profile_images_update on storage.objects;
create policy staff_profile_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'staff-profile-images'
    and auth_role() in ('super_admin', 'admin', 'team_lead', 'employee')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'staff-profile-images'
    and auth_role() in ('super_admin', 'admin', 'team_lead', 'employee')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists staff_profile_images_delete on storage.objects;
create policy staff_profile_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'staff-profile-images'
    and auth_role() in ('super_admin', 'admin', 'team_lead', 'employee')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
