-- 073: Match ticket progress to the numbered client-to-closure workflow.
-- A public staff message represents an outstanding client response request;
-- the ticket's workflow status remains independent of that conversation state.

create or replace function public.ticket_status_label(p_status ticket_status) returns text
language sql immutable set search_path = public as $$
  select case p_status
    when 'new'                    then 'New'
    when 'under_review'           then 'Under review'
    when 'awaiting_clarification' then 'Under review'
    when 'assigned'               then 'Assigned'
    when 'in_progress'            then 'In progress'
    when 'ready_for_review'       then 'Ready for review'
    when 'ready_for_client'       then 'Client review'
    when 'resolved'               then 'Resolved'
    when 'reopened'               then 'Reopened'
    when 'closed'                 then 'Closed'
  end
$$;

-- Recover tickets that used the old reply-needed status as a workflow state.
-- Their underlying stage comes from linked task progress and assignment.
with task_rollup as (
  select ticket_id,
         count(*) filter (where status <> 'cancelled') as total,
         count(*) filter (where status = 'completed') as completed,
         count(*) filter (where status = 'ready_for_review') as ready,
         count(*) filter (where status in ('ready_for_review', 'completed')) as reviewable,
         count(*) filter (where status = 'todo') as todo
  from tasks
  group by ticket_id
)
update tickets t
   set status = case
     when coalesce(r.total, 0) > 0 and r.completed = r.total then 'resolved'::ticket_status
     when coalesce(r.total, 0) > 0 and r.ready > 0 and r.reviewable = r.total then 'ready_for_review'::ticket_status
     when coalesce(r.total, 0) > 0 and r.todo = r.total then 'assigned'::ticket_status
     when coalesce(r.total, 0) > 0 then 'in_progress'::ticket_status
     when t.assignee_id is not null then 'assigned'::ticket_status
     else 'under_review'::ticket_status
   end
  from task_rollup r
 where t.status = 'awaiting_clarification'
   and r.total > 0
   and r.ticket_id = t.id;

update tickets t
   set status = case when t.assignee_id is not null then 'assigned'::ticket_status
                     else 'under_review'::ticket_status end
 where t.status = 'awaiting_clarification'
   and not exists (select 1 from tasks k where k.ticket_id = t.id and k.status <> 'cancelled');

-- Reply requests are derived from the latest public conversation message. Do
-- not allow the retired hold status to be written again through direct APIs.
create or replace function public.guard_ticket_awaiting_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'awaiting_clarification'
     and old.status is distinct from new.status
     and current_setting('app.bypass_guard', true) is distinct from 'on' then
    raise exception 'Request a client reply with a public ticket message';
  end if;
  return new;
end $$;

-- A Manager/Super Admin assignment advances a new or reviewed ticket into
-- the assigned stage. Later workflow stages are not moved backwards.
create or replace function public.set_ticket_assigned_stage() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.assignee_id is not null
     and new.status in ('new', 'under_review', 'awaiting_clarification')
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    new.status := 'assigned';
  end if;
  return new;
end $$;

drop trigger if exists tickets_b_assign_stage on tickets;
create trigger tickets_b_assign_stage
  before insert or update of assignee_id on tickets
  for each row execute function public.set_ticket_assigned_stage();

-- Parent ticket stage follows the linked tasks:
-- all todo -> Assigned; active work -> In progress;
-- all submitted/completed with at least one submitted -> Ready for review;
-- all completed -> Resolved. Resolved is the client's review step in the
-- portal; client approval closes it and a change request reopens it.
create or replace function public.sync_ticket_progress_from_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket_id uuid;
  v_ticket_status ticket_status;
  v_total integer;
  v_done integer;
  v_ready integer;
  v_reviewable integer;
  v_todo integer;
  v_target ticket_status;
begin
  v_ticket_id := case when tg_op = 'DELETE' then old.ticket_id else new.ticket_id end;
  if v_ticket_id is null then return null; end if;

  select status into v_ticket_status from tickets where id = v_ticket_id;
  if not found or v_ticket_status = 'closed' then return null; end if;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'ready_for_review'),
         count(*) filter (where status in ('ready_for_review', 'completed')),
         count(*) filter (where status = 'todo')
    into v_total, v_done, v_ready, v_reviewable, v_todo
    from tasks where ticket_id = v_ticket_id;

  if v_total = 0 then return null;
  elsif v_done = v_total then v_target := 'resolved';
  elsif v_ready > 0 and v_reviewable = v_total then v_target := 'ready_for_review';
  elsif v_todo = v_total then v_target := 'assigned';
  else v_target := 'in_progress';
  end if;

  if v_target <> v_ticket_status then
    perform set_config('app.bypass_guard', 'on', true);
    update tickets set status = v_target where id = v_ticket_id;
  end if;
  return null;
end $$;

create or replace function public.close_ticket(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_client uuid;
  v_status ticket_status;
begin
  select client_id, status into v_client, v_status from tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket not found'; end if;
  if v_status not in ('resolved', 'ready_for_client') then
    raise exception 'Only resolved work in client review can be closed';
  end if;
  if v_role in ('super_admin', 'admin') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    null;
  else
    raise exception 'Only the client or an admin can close this ticket';
  end if;
  perform set_config('app.bypass_guard', 'on', true);
  update tickets set status = 'closed' where id = p_ticket_id;
end $$;

create or replace function public.reopen_ticket(p_ticket_id uuid, p_feedback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_uid uuid := auth.uid();
  v_client uuid;
  v_status ticket_status;
begin
  select client_id, status into v_client, v_status from tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket not found'; end if;
  if v_status not in ('resolved', 'ready_for_client') then
    raise exception 'Only resolved work in client review can be reopened';
  end if;
  if v_role in ('super_admin', 'admin') then
    null;
  elsif v_role = 'client' and v_client = my_client_id() then
    null;
  else
    raise exception 'Only the client or an admin can reopen this ticket';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update tasks set status = 'changes_requested' where ticket_id = p_ticket_id and status = 'completed';
  update tickets set status = 'reopened' where id = p_ticket_id;

  if p_feedback is not null and length(trim(p_feedback)) > 0 then
    insert into ticket_comments (ticket_id, author_id, body, is_internal)
    values (p_ticket_id, v_uid, p_feedback, false);
  end if;
end $$;

revoke execute on function public.close_ticket(uuid) from anon, public;
grant execute on function public.close_ticket(uuid) to authenticated;
revoke execute on function public.reopen_ticket(uuid, text) from anon, public;
grant execute on function public.reopen_ticket(uuid, text) to authenticated;
