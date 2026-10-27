-- Copy legacy CRM rows into the v2 model while keeping every source table
-- unchanged in the `legacy` schema. Re-runnable: inserts use conflict guards.

-- Existing Auth users without a v2 profile receive the least-privileged role.
insert into public.profiles (id, email, full_name, role, status, signup_source)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', ''),
       'client'::public.app_role, 'pending'::public.account_status,
       'self_signup'::public.signup_source
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- Restore staff roles only for Auth users already linked to legacy team records.
insert into public.profiles
  (id, email, full_name, role, status, signup_source, weekly_capacity_hours, avatar_url)
select u.id, u.email, tm.name,
       case tm.role::text
         when 'admin' then 'admin'::public.app_role
         when 'team_lead' then 'team_lead'::public.app_role
         else 'employee'::public.app_role
       end,
       case when tm.is_active then 'active'::public.account_status
            else 'suspended'::public.account_status end,
       'admin_created'::public.signup_source,
       greatest(coalesce(tm.weekly_capacity_hours, 40), 1), tm.avatar_url
from legacy.team_members tm
join lateral (
  select u1.id, u1.email from auth.users u1 where u1.id = tm.user_id
  union all
  select u2.id, u2.email from auth.users u2
  where lower(u2.email) = lower(tm.email) and u2.id is distinct from tm.user_id
  limit 1
) u on true
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  status = excluded.status,
  signup_source = excluded.signup_source,
  weekly_capacity_hours = excluded.weekly_capacity_hours,
  avatar_url = excluded.avatar_url;

-- Copy the legacy client row and its commercial fields. The original row stays
-- intact in legacy.clients; the v2 account starts active only if it was active.
insert into public.clients
  (id, company_name, contact_name, contact_email, contact_phone,
   whatsapp_group_link, owner_id, status, stage, signup_source,
   created_at, updated_at)
select c.id, c.name, c.contact_name, c.contact_email, c.contact_phone,
       c.whatsapp_group_link,
       (select u.id from auth.users u
        where lower(u.email) = lower(c.contact_email) limit 1),
       case when c.is_active then 'active'::public.account_status
            else 'suspended'::public.account_status end,
       c.lifecycle_stage::text::public.client_stage,
       'admin_created'::public.signup_source,
       c.created_at, c.updated_at
from legacy.clients c
on conflict (id) do nothing;

insert into public.client_internal
  (client_id, health_score, contract_start, contract_end, monthly_retainer, notes)
select c.id, coalesce(c.health_score, 70), c.contract_start, c.contract_end,
       c.monthly_retainer, c.notes
from legacy.clients c
on conflict (client_id) do nothing;

insert into public.client_services (client_id, service_id, status)
select c.id, s.id,
       case when c.is_active then 'active'::public.client_service_status
            else 'stopped'::public.client_service_status end
from legacy.clients c
join public.services s on s.name = case c.service_type::text
  when 'onboarding_setup' then 'Account Onboarding & Setup'
  when 'full_account_management' then 'Account Management'
  when 'ads_only' then 'Ads Management'
end
on conflict do nothing;

insert into public.ecommerce_accounts
  (client_id, platform_id, seller_id, total_listings, live_listings, account_name, status)
select c.id, p.id, null, 0, 0, p.name,
       case when c.is_active then 'active'::public.ecommerce_account_status
            else 'inactive'::public.ecommerce_account_status end
from legacy.clients c
cross join lateral unnest(c.platforms) old_platform
join public.platforms p on lower(p.name) = lower(old_platform::text)
on conflict (client_id, platform_id, account_name) do nothing;

-- The old CRM used `tickets` as internal work items. Copy them as v2 tasks;
-- do not reinterpret them as client-submitted v2 tickets.
insert into public.tasks
  (id, client_id, title, description, type, status, priority, source,
   due_date, deadline_type, estimated_hours, actual_hours,
   created_by, assignee_id, parent_task_id, closed_at, created_at, updated_at)
select t.id, t.client_id, t.title, t.description,
       t.type::text::public.task_type,
       case t.status::text
         when 'open' then 'todo'::public.task_status
         when 'in_progress' then 'in_progress'::public.task_status
         when 'in_review' then 'ready_for_review'::public.task_status
         when 'blocked' then 'in_progress'::public.task_status
         when 'done' then 'completed'::public.task_status
       end,
       t.priority::text::public.task_priority,
       'internal'::public.task_source,
       t.due_date,
       case t.deadline_type
         when 'today' then 'today'::public.deadline_type
         when 'this_week' then 'this_week'::public.deadline_type
         when 'this_month' then 'this_month'::public.deadline_type
         else null
       end,
       t.estimated_hours, t.actual_hours,
       (select u.id from legacy.team_members tm join auth.users u
          on u.id = tm.user_id or lower(u.email) = lower(tm.email)
        where tm.id = t.reporter_id limit 1),
       (select u.id from legacy.team_members tm join auth.users u
          on u.id = tm.user_id or lower(u.email) = lower(tm.email)
        where tm.id = t.assignee_id limit 1),
       t.parent_ticket_id, t.closed_at, t.created_at, t.updated_at
from legacy.tickets t
join public.clients c on c.id = t.client_id
on conflict (id) do nothing;

insert into public.task_comments (id, task_id, author_id, body, created_at, updated_at)
select c.id, c.ticket_id,
       (select u.id from legacy.team_members tm join auth.users u
          on u.id = tm.user_id or lower(u.email) = lower(tm.email)
        where tm.id = c.author_id limit 1),
       c.content, c.created_at, c.updated_at
from legacy.comments c
join public.tasks t on t.id = c.ticket_id
on conflict (id) do nothing;

-- Preserve legacy departments where a clear v2 department match exists.
insert into public.department_members (department_id, profile_id)
select distinct d.id, p.id
from legacy.team_members tm
join auth.users u on u.id = tm.user_id or lower(u.email) = lower(tm.email)
join public.profiles p on p.id = u.id
join public.departments d on lower(d.name) = lower(coalesce(tm.department, ''))
where tm.is_active
on conflict do nothing;

insert into public.client_team (client_id, profile_id, department_id)
select c.id, p.id, d.id
from legacy.clients c
cross join lateral (values
  (c.primary_member_id, c.primary_work_role::text),
  (c.secondary_member_id, c.secondary_work_role::text)
) assignment(member_id, work_role)
join legacy.team_members tm on tm.id = assignment.member_id
join auth.users u on u.id = tm.user_id or lower(u.email) = lower(tm.email)
join public.profiles p on p.id = u.id
join public.departments d on d.slug = case assignment.work_role
  when 'ads_management' then 'ads'
  when 'operations' then 'operations'
  when 'reporting_grievance' then 'reporting'
  when 'setup_listing' then 'listing'
  else null
end
on conflict do nothing;

insert into public.time_logs (id, task_id, profile_id, hours, logged_date, notes, created_at)
select l.id, l.ticket_id,
       (select u.id from legacy.team_members tm join auth.users u
          on u.id = tm.user_id or lower(u.email) = lower(tm.email)
        where tm.id = l.member_id limit 1),
       l.hours, l.logged_date, l.notes, l.created_at
from legacy.time_logs l
join public.tasks t on t.id = l.ticket_id
where l.hours > 0 and l.hours <= 24
  and exists (select 1 from legacy.team_members tm join auth.users u
               on u.id = tm.user_id or lower(u.email) = lower(tm.email)
              where tm.id = l.member_id)
on conflict (id) do nothing;

insert into public.task_activity (id, task_id, actor_id, action, old_value, new_value, created_at)
select a.id, a.ticket_id,
       (select u.id from legacy.team_members tm join auth.users u
          on u.id = tm.user_id or lower(u.email) = lower(tm.email)
        where tm.id = a.actor_id limit 1),
       a.action, a.old_value, a.new_value, a.created_at
from legacy.activity_logs a
join public.tasks t on t.id = a.ticket_id
on conflict (id) do nothing;

insert into public.notifications
  (id, recipient_id, type, title, body, task_id, client_id, is_read, created_at)
select n.id,
       (select u.id from legacy.team_members tm join auth.users u
          on u.id = tm.user_id or lower(u.email) = lower(tm.email)
        where tm.id = n.recipient_id limit 1),
       n.type::text, n.title, n.body,
       case when t.id is not null then n.ticket_id else null end,
       case when c.id is not null then n.client_id else null end,
       n.is_read, n.created_at
from legacy.notifications n
join public.profiles p on p.id = (
  select u.id from legacy.team_members tm join auth.users u
    on u.id = tm.user_id or lower(u.email) = lower(tm.email)
  where tm.id = n.recipient_id limit 1
)
left join public.tasks t on t.id = n.ticket_id
left join public.clients c on c.id = n.client_id
on conflict (id) do nothing;
