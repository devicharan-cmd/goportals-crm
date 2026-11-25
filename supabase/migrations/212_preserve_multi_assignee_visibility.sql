-- Preserve normal task visibility for grouped copies. The workflow hides a
-- waiting future copy from unrelated viewers, but a task must remain visible
-- to its assignee, creator/assigner, and super admins just like any normal
-- task (including after that copy is completed).

begin;

create or replace function public.task_workflow_visible(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with current_task as (
    select id, task_group_id, assignee_id, created_by, assigned_by
    from public.tasks
    where id = p_task_id
  ),
  active_task as (
    select case
      when exists (
        select 1
        from public.tasks requested
        join current_task c on c.task_group_id = requested.task_group_id
        where requested.status = 'changes_requested'
      ) then (
        select requested.id
        from public.tasks requested
        join current_task c on c.task_group_id = requested.task_group_id
        where requested.status = 'changes_requested'
        order by requested.assignee_sequence desc nulls last
        limit 1
      )
      else coalesce(
        (
          select candidate.id
          from public.tasks candidate
          join current_task c on c.task_group_id = candidate.task_group_id
          where candidate.status not in ('completed', 'cancelled')
          order by candidate.assignee_sequence
          limit 1
        ),
        (
          select candidate.id
          from public.tasks candidate
          join current_task c on c.task_group_id = candidate.task_group_id
          order by candidate.assignee_sequence desc nulls last
          limit 1
        )
      )
    end as id
  )
  select case
    when c.task_group_id is null then true
    when auth_role() = 'super_admin' then true
    when c.assignee_id = auth.uid()
      or c.created_by = auth.uid()
      or c.assigned_by = auth.uid() then true
    else a.id = c.id
  end
  from current_task c
  left join active_task a on true;
$$;

revoke all on function public.task_workflow_visible(uuid) from public, anon;
grant execute on function public.task_workflow_visible(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
