-- Private standalone tasks may be internal work that is not tied to a client.
-- Public tasks and ticket-linked tasks still require a client.
alter table public.tasks
  alter column client_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tasks'::regclass
       and conname = 'tasks_visibility_client_check'
  ) then
    alter table public.tasks
      add constraint tasks_visibility_client_check
      check (
        (visibility <> 'public' or client_id is not null)
        and (ticket_id is null or client_id is not null)
      );
  end if;
end
$$;
