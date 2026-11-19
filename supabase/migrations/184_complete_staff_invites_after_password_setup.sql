-- Keep invited staff unavailable until they verify the invite and choose a password.
-- Supabase creates auth.users when inviteUserByEmail() sends the email, so account
-- creation itself must not count as the invitee accepting the invitation.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
begin
  select * into inv from public.invites
  where lower(email) = lower(new.email)
    and used_at is null
    and cancelled_at is null
    and expires_at > now()
  order by created_at desc limit 1;

  if inv.id is not null then
    insert into public.profiles (id, email, full_name, role, status, signup_source, job_title, reporting_to)
    values (
      new.id, new.email,
      coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', ''),
      inv.role,
      'pending'::public.account_status,
      case when inv.role = 'client'
           then (case when inv.client_id is null then 'invite' else 'admin_created' end)::public.signup_source
      end,
      inv.job_title,
      inv.reporting_to
    );

    insert into public.department_members (department_id, profile_id)
    select unnest(inv.department_ids), new.id
    on conflict do nothing;

    if inv.role = 'client' and inv.client_id is not null then
      update public.clients set owner_id = new.id where id = inv.client_id and owner_id is null;
    end if;
  else
    insert into public.profiles (id, email, full_name, role, status, signup_source)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
            'client', 'pending', 'self_signup');
  end if;

  return new;
end $$;

create or replace function public.complete_invite_setup() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_invite public.invites%rowtype;
  v_email_confirmed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to finish account setup';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'Your account profile could not be found';
  end if;

  -- Existing active accounts using the password reset form need no invite action.
  if v_profile.status = 'active' then
    return true;
  end if;

  select email_confirmed_at into v_email_confirmed_at
  from auth.users
  where id = auth.uid();

  if v_email_confirmed_at is null then
    raise exception 'Verify your email before finishing account setup';
  end if;

  select * into v_invite
  from public.invites
  where lower(email) = lower(v_profile.email)
    and role = v_profile.role
    and used_at is null
    and cancelled_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    -- Self-registered clients remain pending for onboarding/approval. Invited
    -- staff must have a live matching invite before they can become active.
    if v_profile.role = 'client' then
      return true;
    end if;
    raise exception 'A valid invitation was not found for this account';
  end if;

  update public.invites
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id and used_at is null;

  if v_profile.role <> 'client' then
    perform set_config('app.bypass_guard', 'on', true);
    update public.profiles
    set status = 'active'
    where id = auth.uid() and status = 'pending';
  end if;

  return true;
end $$;

revoke all on function public.complete_invite_setup() from public, anon;
grant execute on function public.complete_invite_setup() to authenticated;
