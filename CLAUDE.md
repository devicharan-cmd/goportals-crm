# GoPortals Agency CRM — Working Guide

Read this before making changes; it lets you skip reading the whole codebase.
`README.md` covers setup and deploy; this file covers how the code works.

Internal CRM + client portal for an e-commerce agency: brands ("clients") selling on Amazon, Flipkart,
Myntra, Blinkit, Zepto, Nykaa, etc. Clients raise **tickets** in the portal; staff break them into
internal **tasks**, review the work, and the client closes or reopens the ticket.

## Stack & commands
- Next.js **14.2.5** App Router, React 18, TypeScript, Tailwind 3, lucide-react, `@dnd-kit/core` (Kanban boards),
  `date-fns`, `leaflet` + OpenStreetMap/Nominatim (address picker, no API key), `resend` (email).
  Supabase (`@supabase/ssr` + `@supabase/supabase-js`) for Postgres, Auth and Storage.
- `npm run dev` / `npm run build` / `npm run lint`. No test suite.
- `next.config.mjs` sets `ignoreBuildErrors` + `ignoreDuringBuilds` → **a passing build does not mean types are correct.**
  Run `npx tsc --noEmit` to check types.
- Path alias `@/*` → repo root.
- Deployed on Vercel: `https://agency-crm-gilt-sigma.vercel.app` (fallback for `NEXT_PUBLIC_APP_URL`).
  A Git push / Vercel deploy does **not** apply SQL migrations — those are run by hand in Supabase.
- Radix, recharts and class-variance-authority are installed but unused. UI is hand-written in `components/ui/`.
- `code.zip` is an old v1 snapshot; `supabase/combined_013_to_019.sql` is a re-runnable copy of migrations 013–019. Neither is used by the app.

## Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `RESEND_API_KEY`,
`NEXT_PUBLIC_APP_URL`, optional `CRON_SECRET` (lets a scheduler call `/api/notify`). Real values live in `.env` / `.env.local`
(gitignored). Never put real keys in `.env.local.example`.

## Layout
```
middleware.ts                 verifies the JWT (getClaims), forwards x-user-id, routes by role/status
lib/auth.ts                   getProfile() (cached per request), requireStaff/requireAdmin/requireSuperAdmin/requireClient/requireRole
lib/queries.ts                shared server lookups: getStaffLookups, assignableFor (mirrors can_assign()),
                              assigneeOptionsFor, resolveTaskId/resolveTicketId (accept UUID or GP-/TK- code),
                              getTicketAttachments (signed URLs), clientIdsForTeamLead, TASK_LIST_SELECT, TICKET_LIST_SELECT
lib/constants.ts              labels/styles for roles, task + ticket statuses, priority, stages, billing, activity
lib/ticket-categories.ts      the 10 ticket categories and their form fields (must match guard_ticket_details() in SQL)
lib/utils.ts                  cn, formatDate, formatRelative, formatINR, dueState/dueLabel, dueDateFor, capacity/health colors,
                              errorMessage (friendly Postgres errors), taskCode/parseTaskCode, ticketCode/parseTicketCode
lib/portal.ts                 getMyClientId, getPortalNames (staff names via staff_directory() RPC)
lib/email.ts                  branded HTML for Resend emails
lib/supabase/{client,server,admin}.ts   browser client · server client (cookies) · service role (bypasses RLS, API routes only)
types/database.ts             row types + enum unions for schema v2 — keep in sync with the SQL

app/(auth)/                   login, forgot-password (signup just redirects to /login — self-signup is off)
app/auth/callback, set-password   landing page for every Supabase email link (invite / recovery / confirm), then choose password
app/onboarding, app/pending, app/blocked   client gate: wizard + agreement → waiting for approval → suspended/rejected
app/(staff)/                  dashboard, tickets, tasks, urgent, clients, team (+ team/[id] stats), reports, notifications,
                              admin/{approvals,users,settings,agreement}. layout.tsx = AppShell + nav badge counts
app/portal/                   client: overview, tickets (list/new/[id]/edit), services, profile, notifications
app/api/admin/invite          POST staff or client invite (writes `invites` row, then Supabase inviteUserByEmail); DELETE cancels
app/api/agreement/accept      POST → accept_agreement() RPC with IP + user agent
app/api/notify                POST overdue-task / contract-renewal emails (super_admin, or Bearer CRON_SECRET)

components/layout             AppShell (sidebar NAV arrays — add new pages here), AuthLayout, Logo
components/ui                 Button/ButtonLink, Card/CardHeader/PageHeader/EmptyState/Alert/Field/Avatar/StatCard, badges, Modal
components/tasks              TaskForm, TaskTable, TaskBoard, TaskFilters, TaskProperties, AssignButton, ClaimButton,
                              CommentThread + ActivityTimeline (shared with tickets), ChecklistPanel, TimeLogPanel
components/tickets            TicketBoard, TicketProperties, CreateTasksModal, ClaimTicketButton
components/portal             PortalTicketForm (also used by staff at /tickets/new), Close/ReopenTicketButton, PortalProfileForm
components/clients, admin, onboarding, shared, team   feature widgets (ClientEditors, UserAdmin, MasterData, OnboardingWizard, AddressPicker…)
supabase/migrations/          000–059, numbered; the DB source of truth
```

## Roles & routing
- Supabase Auth logs the user in; **`public.profiles`** holds `role` and `status`. Never authorize from `user_metadata`.
  A new login gets its role from a matching row in `invites` (trigger `handle_new_user`); no invite → pending client.
- Roles: `super_admin`, `admin`, `team_lead`, `employee`, `client`. (`manager` still exists in the enum but is retired — migration 042 turned every manager into admin.)
  - **super_admin** — everything; the only role that can change profile role/status/capacity, edit platforms/services/departments, publish agreements, delete.
  - **admin** — company-wide on clients, tasks, tickets, approvals, department membership; can invite team_lead/employee.
  - **team_lead** — scoped to their departments (`department_members`) and the clients those departments cover (`client_team`);
    reviews tasks; can assign only to employees who share a department.
  - **employee** — their own and urgent tasks/tickets; can't change assignee or due date, can't mark urgent, can't approve their own task.
  - **client** — `/portal` only, their own company (`clients.owner_id = profile.id`).
- `middleware.ts`: no session → `/login`. For `/portal` and staff routes it only verifies the JWT and passes `x-user-id`; the
  layouts' `require*()` guards check role/status. Other paths: clients are sent to `/onboarding` (no company yet or agreement
  not accepted), `/pending` (awaiting approval) or `/portal`; suspended/rejected → `/blocked`; `/admin`, `/clients`, `/reports`
  are admin+; `/team` is not for employees.
- **New staff route:** add the prefix to `STAFF_PREFIXES` in middleware, a role guard in the page, and an entry in `AppShell`'s `STAFF_NAV`.

## Data model (schema v2)
- People: `profiles`, `departments`, `department_members` (`is_lead` marks the dept lead), `invites` (soft-cancelled via `cancelled_at`).
- Master data (super_admin edits): `platforms` (category marketplace/quick_commerce/d2c/other), `services` (default price + department).
- Clients: `clients` (company, address with optional lat/long, company profile image path in private Storage bucket `client-profile-images`, status, stage, `owner_id`), `client_internal` (health, contract dates,
  retainer, notes — **never shown to the client**), `ecommerce_accounts` (several per platform allowed), `client_services`
  (agreed price frozen at assignment, optionally per account), `client_team` (who covers a client, per department).
- Agreements: `agreements` (one `is_current`), `agreement_acceptances` (insert-only, with `terms_snapshot` of accounts/services/prices).
- **Tickets** (`TK-` + `ticket_number`): client requests. `category` + `details` jsonb; `is_urgent` is set by the client.
  Children: `ticket_comments`, `ticket_attachments` (bucket `ticket-files/<ticket_id>/…`), `ticket_activity`.
  Statuses: `new → under_review → awaiting_clarification → assigned → in_progress → ready_for_client → resolved → closed`, plus `reopened`.
- **Tasks** (`GP-` + `task_number`): internal work; `ticket_id` links back to a ticket (optional). Children: `task_comments`,
  `task_attachments` (bucket `task-files`), `task_activity`, `task_checklist_items`, `time_logs`.
  Statuses: `todo, in_progress, ready_for_review, changes_requested, completed, cancelled`.
- `notifications` (per recipient; `task_id` and/or `ticket_id`).
- Old v1 tables live untouched in the `legacy` schema (see cutover below).

## Business rules live in the database — don't duplicate them in app code
Triggers (fire alphabetically per table) and RPCs enforce:
- **Write guards** `guard_task_write`, `guard_ticket_write`, `guard_client_update`, `guard_profile_update`, `guard_comment_write`:
  who may change which columns. Clients can't touch tasks at all. Clients edit a ticket only while it's `new`.
  Comments: client → always public, employee → always team-only, admin/team_lead → choose.
- **Required ticket fields** `guard_ticket_details` — mirror of `lib/ticket-categories.ts`. Change both together.
- **Auto-progress** `sync_ticket_progress_from_tasks`: when linked tasks change, a ticket becomes `resolved` once every
  non-cancelled task is `completed`, otherwise `in_progress`. Never touches `closed`.
- **Close / reopen only via RPC**: `close_ticket()` and `reopen_ticket()` (client owner or admin, ticket must be `resolved`).
  Writing `closed`/`reopened` directly is rejected; a closed ticket is permanently read-only. Reopen sends completed tasks to `changes_requested`.
- **Claiming**: `claim_task()` / `claim_ticket()` — first person to pick up an urgent, unassigned item wins.
- Other RPCs: `save_client_onboarding`, `accept_agreement`, `approve_client`, `needs_agreement`, `staff_directory` (safe staff names for clients).
- Also automatic: `updated_at`, `closed_at` (tasks on `completed`, tickets on `closed`), activity logs, notifications, task/ticket numbers.
- Visibility is RLS via `task_visible()`, `ticket_visible()`, `can_see_client()`, `can_assign()`. If the UI hides something, RLS must too.
  Internal-only bypass: `set_config('app.bypass_guard','on',true)` inside security-definer functions — never from app code.

## Migrations
- Add the next number (`059_…`); update `types/database.ts`, `lib/constants.ts`, forms and any explicit `select(...)` lists.
  Write them safe to re-run where possible (`if not exists`, `create or replace`, `drop policy if exists`).
- Gotchas: a new enum value must be added in its own migration and committed before use (see 041, 054).
  044 (task/ticket status split) is one-shot — never re-run. 050 is a catch-up because 021–039 were never applied to the live DB,
  so **check the live schema before assuming a migration ran**. 058 (team lead client visibility) and 059 (client profile images) must be applied in Supabase separately.
- Seeds, not for production: `012` (obsolete, pre-v2 shape), `049` (sample clients/tasks/tickets), `051`, `052` (staff invites).

### Legacy v1 → v2 cutover (existing databases only)
1. `000_archive_legacy_v1.sql` moves v1 tables/enums from `public` to `legacy` (nothing dropped).
2. Run `001`…`058` in order (skip the seeds above).
3. `057_migrate_legacy_v1_data.sql` copies legacy users, clients, services/platforms, team links, work items, comments, time logs,
   activity and notifications into v2. Legacy `tickets` become v2 **tasks** (not client tickets). `legacy.ticket_blockers` has no destination.
   Audit row counts and unmatched rows afterwards; never drop the `legacy` schema as routine cleanup. Don't run 057 on a fresh database.
Back up production before any migration.

## Code conventions
- Server Components fetch with `@/lib/supabase/server`, call a `require*()` guard first, run queries in `Promise.all`, and pass
  data to `'use client'` components. Shared lookups come from `lib/queries.ts`.
- Client components write straight to Supabase with `@/lib/supabase/client`, show `errorMessage(error)`, then `router.refresh()`
  (`router.push` after create). Only service-role work goes through `/api/...`; those routes check `getProfile()` themselves.
- Forms: local `useState` object, `saving`/`error` state, empty strings → `null` in the payload.
- Joins use PostgREST embeds, e.g. `TASK_LIST_SELECT` = `*, client:clients(id, company_name), platform:platforms(id, name), department:departments(id, name)`.
  Names are resolved client-side with `nameMap(people)` rather than joined.
- Task/ticket URLs accept the UUID or the short code (`/tasks/GP-1024`, `/portal/tickets/TK-1024`).
- Styling: brand palette in `tailwind.config.ts` (`brand` teal-blue #045E80, `lime` #95C12C, `navy`); global `.input`, `.label`, `.card`
  classes in `app/globals.css`; buttons via `<Button variant="primary|secondary|ghost|danger|lime">`; status/priority colors from
  `lib/constants.ts` (`TASK_STATUS_STYLES`, `TICKET_STATUS_STYLES`, `PRIORITY_STYLES`) — don't inline new ones.
- Due dates: use `dueState`/`dueLabel`/`<DueDate>` (overdue/today red, ≤3 days amber); quick deadline buttons use `dueDateFor`
  (today / coming Sunday / month end). Currency via `formatINR`; dates via `formatDate` (`dd MMM yyyy`).
- Workload = Σ `estimated_hours` (default 3) of non-terminal tasks ÷ `weekly_capacity_hours`; colors from `capacityColor`.

## Checklist for common changes
- **New ticket category field**: `lib/ticket-categories.ts` → new migration updating `guard_ticket_details()` → detail display is automatic.
- **New task/ticket/client column**: migration → `types/database.ts` → form payloads → display pages → explicit `select(...)` lists.
- **New staff page**: `app/(staff)/<name>/page.tsx` with a guard → `STAFF_NAV` in `AppShell` → `STAFF_PREFIXES` in middleware.
- **New admin action needing the service role**: API route that checks `getProfile()` role/status, then `createAdminClient()`.
- **Portal change**: rely on RLS + `clients.owner_id`; never expose internal comments, `client_internal`, retainer or team capacity.

## Known gaps (as of 2026-10-28)
- `ClientStatusSelect` also updates the owner's `profiles.status`, which only super_admin may change — fails half-way for admins.
- `lib/ticket-categories.ts` links `/guidelines/*.pdf`, but `*.pdf` is gitignored, so `public/guidelines/` doesn't exist.
- Dashboard "New client requests" still queries client-sourced tasks (replaced by tickets since 014).
- Reports cover tasks only, not tickets. Nothing schedules `/api/notify`.
