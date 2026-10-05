# GoPortals Agency CRM — Working Guide

Read this before making changes; it lets you skip reading the whole codebase.
(Long-form architecture notes with diagrams are in `STRUCTURE.md`.)

Internal CRM for an e-commerce marketplace agency: brands ("clients") selling on Amazon/Flipkart/Myntra/Blinkit/Meesho/Nykaa, ticketing + Kanban, team workload, monthly reports, and a separate client portal for brand reps.

## Stack & commands
- Next.js **14.2.5** App Router, React 18, TypeScript, Tailwind 3, lucide-react icons, `@dnd-kit/core` (Kanban), `date-fns`, `resend` (email). Supabase (`@supabase/ssr` + `@supabase/supabase-js`) for DB + auth.
- `npm run dev` / `npm run build` / `npm run lint`. No test suite.
- `next.config.mjs` sets `ignoreBuildErrors` + `ignoreDuringBuilds` → **a passing build does not mean types are correct.** Run `npx tsc --noEmit` to check types.
- Path alias `@/*` → repo root (`@/lib/...`, `@/components/...`, `@/types`).
- Deployed on Vercel: `https://agency-crm-gilt-sigma.vercel.app` (hardcoded fallback for `NEXT_PUBLIC_APP_URL`).
- Radix, recharts, class-variance-authority are installed but essentially unused; UI is hand-written Tailwind (no shadcn components exist in the repo).

## Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`. Real values live in `.env` / `.env.local` (gitignored). Never put real keys in `.env.local.example`.

## Layout
```
middleware.ts                 auth + role routing (see Auth)
lib/supabase/client.ts        createClient()  – browser, for 'use client' components
lib/supabase/server.ts        createClient()  – server components / route handlers (cookies)
lib/supabase/admin.ts         createAdminClient() – service role, bypasses RLS, API routes ONLY
lib/utils.ts                  cn, formatDate, formatRelative, isOverdue, isDueSoon, getInitials,
                              getHealthColor, getCapacityColor, truncate
types/index.ts                all types + label/color maps (SERVICE_TYPE_ROLES, SERVICE_TYPE_LABELS,
                              LIFECYCLE_STAGE_LABELS, PLATFORM_LABELS, PRIORITY_COLORS, STATUS_COLORS)
supabase/migrations/001_schema.sql   original schema (OUT OF DATE — see Schema drift)

app/(auth)/login              email+password login (client component)
app/(dashboard)/layout.tsx    Sidebar + TopBar shell, redirects to /login if no user
  dashboard/                  KPI cards, per-member open tasks, recent tickets, SendNotificationsButton
  clients/                    list (listing stats, dept in-charges) · new · [id] detail · [id]/edit
  tickets/                    list view + KanbanBoard · new (?client_id= prefill) · [id] detail · [id]/edit
  team/                       workload bars; AdminTeamPanel for admins
  reports/                    page.tsx (server fetch) → ReportsClient.tsx (month/member filter, print-PDF)
  notifications/              in-app notifications for current member
app/portal/                   client portal: layout (checks role==='client'), dashboard, tickets, tickets/new
app/api/admin/assignments     GET/POST/DELETE client_assignments (POST/DELETE admin-only)
app/api/admin/portal-user     POST invite brand rep (user_metadata {role:'client', client_id, name})
app/api/admin/team            POST invite member + insert team_members; PATCH whitelisted fields
app/api/notify                POST {type:'overdue'|'renewal'|'all'} → Resend emails (no auth check)

components/shared    Sidebar (NAV array — add new pages here), TopBar, SendNotificationsButton
components/clients   ClientForm, EditClientForm, AssignMembersPanel, CreatePortalUserButton
components/tickets   TicketForm, EditTicketForm, KanbanBoard, TicketStatusUpdater, CommentBox, TimeLogBox, ActivityLog
components/team      AdminTeamPanel
components/portal    PortalTicketForm, PortalSignOutButton
components/reports   ExportPDFButton (window.print)
```

## Auth & roles
- Supabase Auth. Two kinds of users, distinguished by `user.user_metadata.role`:
  - `'client'` → brand rep; only `/portal/*`. Their brand is `user_metadata.client_id`.
  - anything else → internal staff; `/dashboard`, `/clients`, `/tickets`, `/team`, `/reports`, `/notifications`.
- `middleware.ts` redirects: no user → `/login`; client on dashboard routes → `/portal/dashboard`; staff on `/portal` → `/dashboard`. **If you add a new top-level internal route, add it to `isDashboardRoute` in middleware.**
- Staff ↔ `team_members` row via `team_members.user_id = auth.users.id`.
- **Admin = `team_members.is_admin`** (boolean), NOT `role === 'admin'`. Standard pattern in server pages:
  ```ts
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, is_admin').eq('user_id', user.id).single()
    : { data: null }
  const isAdmin = currentMember?.is_admin ?? false
  ```
  API routes each define a local `verifyAdmin()` doing the same, then use `createAdminClient()`.
- Visibility: admins see all brands/tickets; non-admins only see clients in `client_assignments` where `member_id = currentMember.id` (filtering is done in page code, not RLS — see `clients/page.tsx`, `tickets/page.tsx`).

## Data model (actual, as used by the code)
Enums (Postgres + `types/index.ts`, keep in sync):
- `ticket_status`: open, in_progress, in_review, done, blocked · `ticket_priority`: P1–P4 (P1 highest) · `ticket_type`: task, issue, request, grievance
- `platform`: amazon, flipkart, myntra, blinkit, meesho, nykaa, other
- `lifecycle_stage`: onboarding, setup, scale, retention, churned · `service_type`: onboarding_setup, full_account_management, ads_only
- `work_role`: ads_management, operations, reporting_grievance, setup_listing · `member_role`: admin, team_lead, member

Tables:
- **team_members**: id, user_id, name, email (unique), role, department, weekly_capacity_hours (40), avatar_url, is_active, **is_admin**, timestamps
- **clients**: id, name, industry, service_type, lifecycle_stage, health_score (0–100), **account_status** ('Working' | 'On Hold' | 'Discontinued'), **total_listings**, **live_listings**, contact_name/email/phone, whatsapp_group_link, contract_start/end (date), monthly_retainer (₹), primary/secondary_member_id, primary/secondary_work_role, platforms (platform[]), notes, is_active, timestamps
- **client_assignments**: client_id, member_id (unique pair, upsert on `client_id,member_id`), **assignment_role** (dept: 'ads' | 'operations' | 'listing' | 'reporting' | 'grievance' | 'setup')
- **tickets**: id, title, description, client_id (required), assignee_id, reporter_id, type, status, priority, platform, external_ref (marketplace case ID), due_date (date), **deadline_type** ('today' | 'this_week' | 'this_month' | null), estimated_hours (default 3), actual_hours, parent_ticket_id, is_auto_generated, **assigned_date**, **assigned_by**, created_at, updated_at, closed_at
- **comments** (ticket_id, author_id, content) · **time_logs** (ticket_id, member_id, hours, logged_date, notes) · **activity_logs** (ticket_id, client_id, actor_id, action, old_value, new_value) · **notifications** (recipient_id, type, title, body, ticket_id, client_id, is_read) · **ticket_blockers** (unused in UI)

DB triggers (don't duplicate in app code):
- `updated_at` auto-set on clients/tickets/team_members/comments.
- `closed_at` set when status → done, cleared when reopened.
- Inserting a client with `lifecycle_stage='onboarding'` auto-creates **10 onboarding tickets** (P2, `is_auto_generated=true`, assigned to primary_member_id).

### Schema v2 (in progress) ⚠
`supabase/migrations/001–004` now hold a **new** schema (roles super_admin/manager/employee/client in `profiles`, `tasks` instead of `tickets`, client signup + agreement + approval, RLS enforced in the DB). The app code below still targets the OLD schema until it is migrated — plan: `~/.claude/plans/let-s-plan-the-database-vast-quilt.md`. Business rules live in DB triggers (`guard_task_write`, `guard_profile_update`, `log_task_activity`, `notify_task_change`) and RPCs (`claim_task`, `save_client_onboarding`, `accept_agreement`, `approve_client`) — don't duplicate them in app code.

### Schema drift ⚠ (old schema)
Columns in **bold** above plus the whole `client_assignments` table exist in the live Supabase DB but are **not** in `001_schema.sql`, and `is_admin`/`deadline_type`/etc. are missing from `types/index.ts` (code uses `any` casts). When you change the schema: write a new `supabase/migrations/00N_*.sql` (the user runs it in the Supabase SQL editor), and update `types/index.ts`.

RLS: authenticated users can SELECT everything (notifications only their own) and INSERT/UPDATE clients, tickets, comments, time_logs, team_members. No DELETE policies — deletes need the admin client via an API route. RLS does not isolate portal clients; portal pages must always filter by `client_id`.

## Code conventions
- Server Components (default) fetch with `@/lib/supabase/server` and pass data as props to `'use client'` components. Parallelize with `Promise.all`.
- Client components write directly to Supabase via `@/lib/supabase/client`, then `router.refresh()` (and `router.push(...)` after create/edit). Admin-only writes go through `fetch('/api/admin/...')`.
- Forms: local `useState` form object, `saving`/`error` state, empty strings → `null` on insert (`form.x || null`).
- Joins use PostgREST FK hints: `assignee:team_members!assignee_id(id, name)`, `primary_member:team_members!primary_member_id(...)`, `clients(name)`. Results are typed loosely (`any`) — follow that pattern.
- Activity log: `TicketStatusUpdater` inserts `activity_logs` rows (`status_changed`, `assignee_changed`); KanbanBoard drag does optimistic update + revert on error but does NOT log activity.
- Styling: plain Tailwind, cards = `bg-white rounded-xl border border-gray-200`, primary button = `bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg`. Priority/status badge colors are often inlined ternaries rather than `PRIORITY_COLORS`/`STATUS_COLORS`.
- Deadline helpers are duplicated per file (dashboard, tickets page, KanbanBoard, portal): days = diff of midnight-normalized dates; <0 overdue (red), 0 today (red), ≤3 soon (amber), else ok (green).
- `deadline_type` quick buttons (TicketForm/EditTicketForm `applyDeadlineType`) also set `due_date` (today / upcoming Sunday / month end).
- Workload (`team/page.tsx`): used hours = Σ `estimated_hours` (fallback 3) of tickets with status open/in_progress/blocked/in_review; % vs `weekly_capacity_hours`; colors via `getCapacityColor` (≥100 red, ≥80 yellow).
- Reports: month bucket = `(assigned_date ?? created_at).slice(0,7)`; only tickets with an assignee count; "escalated" = blocked. Renewal alerts = contract_end within 60 days.
- Currency ₹ with `toLocaleString('en-IN')`; dates via `formatDate` → `dd MMM yyyy`.
- Some status maps include legacy `waiting_on_client` / `escalated` keys — not real enum values.

## Checklist for common changes
- **New ticket/client field**: migration SQL → `types/index.ts` → create form + edit form (insert/update payload) → display pages → any explicit `select(...)` column lists (tickets/page.tsx `SELECT`, portal pages, reports).
- **New internal page**: `app/(dashboard)/<name>/page.tsx` + entry in `Sidebar` `NAV` + prefix in middleware `isDashboardRoute`.
- **New admin action**: API route with `verifyAdmin()` + `createAdminClient()`; call from client component via `fetch`, then `router.refresh()`.
- **Portal change**: always scope queries with `.eq('client_id', user.user_metadata.client_id)`; never expose internal comments, retainer, or team capacity.
