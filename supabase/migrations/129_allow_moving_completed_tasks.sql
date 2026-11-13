-- Assigned staff may correct a task that was accidentally marked completed.
-- Keep the client-only changes-requested rule intact.
create or replace function public.guard_client_review_task_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.bypass_guard', true) = 'on'
     or auth_role() = 'client' then
    return new;
  end if;

  if new.status = 'changes_requested' then
    raise exception 'Only the client can request changes during Client review';
  end if;

  return new;
end
$$;
