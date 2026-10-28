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
middleware.ts                 session verification and role routing
lib/auth.ts                   profile lookup and server-side role guards
lib/supabase/client.ts        browser Supabase client
lib/supabase/server.ts        server component / route Supabase client
lib/supabase/admin.ts         server-only service-role client; bypasses RLS
lib/queries.ts                shared server-side data lookups
types/database.ts             schema-v2 row interfaces, roles, statuses, enum unions
supabase/migrations/001_enums_tables.sql  base v2 schema (followed by numbered migrations)

app/(auth)/                    login, signup, forgot-password and password recovery
app/(staff)/                   dashboard, clients, tasks, tickets, urgent, team, reports, admin
app/onboarding/ and app/pending/ client onboarding and approval gate
app/portal/                    client-facing dashboard, tickets, profile and services
app/api/                       auth callbacks, admin operations, agreement acceptance, email
components/                    shared UI and admin, client, task, ticket, team and portal features
```

## Auth & roles
- Supabase Auth authenticates the user; `public.profiles` supplies the app role and account status. Never authorize from `user_metadata`.
- Roles are `super_admin`, `admin`, `team_lead`, `employee`, and `client`. `lib/auth.ts` owns role guards; admin access includes `super_admin` and `admin`.
- Middleware verifies the session and routes users; server pages and RLS enforce profile status, role, and data visibility. If adding a staff route, update the staff route handling in `middleware.ts` and apply the correct server-side role guard.
- Client signup uses `/onboarding`, agreement acceptance, then `/pending` until approved. Do not activate a self-signup client by skipping the agreement or approval flow.
- Supabase service-role access bypasses RLS. Keep it in server-only code and use it only where an authorized admin API operation requires it.

## Database schema and legacy migration
The application and `types/database.ts` use schema v2. The schema is maintained in `supabase/migrations/`; `001_schema.sql` and the old `team_members`/single-ticket model described in previous notes are not the current source of truth.

Core model:
- `auth.users` is the Supabase login identity. `public.profiles` is the app identity and source of role/status (`super_admin`, `admin`, `team_lead`, `employee`, `client`). Do not authorize from user metadata. Migration 041 leaves the retired `manager` enum value in Postgres for compatibility; app code should use the roles in `types/database.ts`.
- Client records are in `clients`, with internal/commercial fields in `client_internal`; marketplace accounts use `ecommerce_accounts`; selected work uses `client_services`; staff/client links use `client_team` and `department_members`.
- `tasks` are internal work assigned to staff. `tickets` are client requests and have a separate lifecycle. Migration 014 introduced tickets; migration 044 split task and ticket statuses. Do not merge these concepts or map old legacy tickets into the new client-ticket table.
- Supporting tables include `departments`, `platforms`, `services`, `agreements`, `agreement_acceptances`, `invites`, `task_comments`, `task_attachments`, `task_activity`, `ticket_comments`, `ticket_attachments`, `time_logs`, and `notifications`.
- RLS, triggers, and RPCs enforce access and business rules. Keep role/status guards, onboarding/agreement/approval rules, and task/ticket lifecycle logic in SQL where they already exist; do not bypass them with client-side writes or a service-role client.

### Existing legacy database cutover
The data-preserving cutover uses these files in this order:
1. `000_archive_legacy_v1.sql` moves existing v1 tables and enum types from `public` into the `legacy` schema. It does not drop those source tables or their rows. Run it against an existing v1 database before creating v2 objects.
2. Run schema migrations `001` through `056` in numeric order to create and evolve v2. In production, skip optional sample-data scripts `012`, `049`, `051`, and `052` unless sample records are deliberately wanted.
3. For a database that had the v1 data archived by step 1, run `057_migrate_legacy_v1_data.sql`. It copies matched legacy users, clients, service/platform selections, staff assignments, old work items, comments, time logs, activity, and notifications into v2 while leaving the `legacy` source rows intact. It is designed to be re-runnable with conflict guards.

Important migration details:
- Legacy `tickets` are copied as internal v2 `tasks`; they are not client-submitted v2 `tickets`.
- `legacy.ticket_blockers` remains archived; migration 057 has no v2 destination for it.
- `058_team_lead_client_visibility.sql` updates `can_see_client()` so team leads can see client details for tasks and tickets already within their assigned or managed scope. It changes no tables or rows and must be applied to Supabase separately from the app deployment.
- Some copy statements require matching Auth users, clients, departments, or services. Audit row counts and unmatched source rows before treating the cutover as complete; never drop the `legacy` schema as part of routine cleanup.
- `012_seed_test_data.sql`, `049_seed_test_data_v2.sql`, `051_seed_staff_invites.sql`, and `052_seed_more_staff_invites.sql` add development/sample records. Review before running them against production; they are not required to migrate customer data.
- A clean new database has no v1 source tables, so do not run `057_migrate_legacy_v1_data.sql` there. The v2 SQL migrations are not applied to Supabase by a Git push or Vercel deployment; apply and verify database changes separately.

When changing the schema, add the next numbered migration, preserve existing data, and update `types/database.ts` and the affected queries/forms. Back up production first. Treat migrations that change enum values, statuses, or existing rows as one-time unless their SQL explicitly guarantees safe re-runs. Verify the Supabase result before deploying app code that depends on the change.

## Code conventions
- Server Components (default) fetch with `@/lib/supabase/server` and pass data as props to `'use client'` components. Parallelize with `Promise.all`.
- Client components write directly to Supabase via `@/lib/supabase/client`, then `router.refresh()` (and `router.push(...)` after create/edit). Admin-only writes go through `fetch('/api/admin/...')`.
- Forms: local `useState` form object, `saving`/`error` state, empty strings → `null` on insert (`form.x || null`).
- Joins use the current v2 tables and foreign keys (for example, task assignees are `profiles`, and client ownership is `clients.owner_id`). Follow the explicit FK names used in the relevant query and keep result types aligned with `types/database.ts`.
- Task and ticket history use separate v2 tables (`task_activity` and ticket comments/activity); preserve that separation when adding history or notifications.
- Styling: plain Tailwind, cards = `bg-white rounded-xl border border-gray-200`, primary button = `bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg`. Priority/status badge colors are often inlined ternaries rather than `PRIORITY_COLORS`/`STATUS_COLORS`.
- Deadline helpers are duplicated per file (dashboard, tickets page, KanbanBoard, portal): days = diff of midnight-normalized dates; <0 overdue (red), 0 today (red), ≤3 soon (amber), else ok (green).
- `deadline_type` quick buttons (TicketForm/EditTicketForm `applyDeadlineType`) also set `due_date` (today / upcoming Sunday / month end).
- Workload and reports should use the current v2 task, profile, and client relationships; do not reuse v1 `team_members` or single-ticket assumptions.
- Currency ₹ with `toLocaleString('en-IN')`; dates via `formatDate` → `dd MMM yyyy`.
- Some status maps include legacy `waiting_on_client` / `escalated` keys — not real enum values.

## Checklist for common changes
- **New ticket/client field**: migration SQL → `types/database.ts` → create/edit payloads → display pages → any explicit PostgREST `select(...)` column lists.
- **New internal page**: add it under `app/(staff)/<name>/page.tsx`, add its navigation entry, and include it in middleware route handling and the appropriate server-side role guard.
- **New admin action**: API route with `verifyAdmin()` + `createAdminClient()`; call from client component via `fetch`, then `router.refresh()`.
- **Portal change**: scope client data through the authenticated profile's `clients.owner_id` relationship and RLS; never expose internal comments, retainer, or team capacity.
