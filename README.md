# GoPortals Agency CRM

Internal CRM for an e-commerce marketplace agency: brands ("clients") selling on
Amazon/Flipkart/Myntra/Blinkit/Meesho/Nykaa, staff task management, a client-facing
ticketing portal, team workload, and reports.

## Stack
- **Next.js 14** (App Router) + React 18 + TypeScript
- **Supabase** (Postgres + Auth) — roles and visibility enforced by RLS + DB triggers, not app code
- **Tailwind CSS** — hand-written components in `components/ui/` (Radix/shadcn deps are installed but unused)
- `date-fns`, `lucide-react`, `resend` (email)

No test suite. `next.config.mjs` ignores build/type errors, so a passing `npm run build`
does **not** mean types are correct — run `npx tsc --noEmit` to check.

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create a Supabase project
[supabase.com](https://supabase.com) → New project → wait for provisioning.

### 3. Run the database migrations
In Supabase Dashboard → **SQL Editor**, run every file in `supabase/migrations/`
**in order** (001 through the highest-numbered file) — each one is a separate query.
Business rules (role checks, status transitions, auto-progress, notifications) live in
DB triggers and RPCs, not in the app — don't skip migrations.

### 4. Set environment variables
```bash
cp .env.local.example .env.local
```
Fill in from Supabase → Settings → API:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (service role — server-only, never expose to the client)

Also set `RESEND_API_KEY` (transactional email) and `NEXT_PUBLIC_APP_URL`.

### 5. Create your first staff user
Sign up through the app, then in SQL Editor promote that profile:
```sql
update profiles set role = 'super_admin', status = 'active' where email = 'you@example.com';
```
From there, invite the rest of the team via **Admin → Users** in the app.

### 6. Start the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Roles & routing
Everyone signs in through the same `/login`. `middleware.ts` + `lib/auth.ts` route by
`profiles.role`:

| Role | Access |
|---|---|
| `super_admin` / `admin` | Everything under `/dashboard`, `/clients`, `/tasks`, `/tickets`, `/team`, `/reports`, `/admin` — company-wide |
| `team_lead` | Same staff routes, scoped to their department(s) |
| `employee` | Same staff routes, scoped to their own assigned work |
| `client` | `/portal` only — their own brand's tickets, nothing internal |

A brand rep signs up, lands in `/onboarding` until they accept the agreement, then
`/pending` until an admin approves them (`/admin/approvals`).

## Tasks vs. tickets
These are two separate tables, not the same thing with different names:
- **Tasks** (`/tasks`) — internal work items staff create and assign to each other.
- **Tickets** (`/tickets`, and `/portal/tickets` for clients) — requests raised by a
  client (or on their behalf), with their own status lifecycle and a review/close flow.

A ticket can spawn one or more tasks ("Create a task from this" on the ticket page) —
each linked task shows a "From ticket" reference back to it, and the ticket shows every
task that came from it.

---

## Project structure
```
middleware.ts                  Auth + role-based routing
lib/auth.ts                    requireStaff/requireAdmin/... — role guards for pages
lib/supabase/{client,server}.ts  Supabase clients (browser / server components)
lib/queries.ts                 Shared server-side queries (staff lookups, list selects)
lib/utils.ts                   cn, formatDate, dueState, capacityColor, ...
types/database.ts              Row types + enums for schema v2 (keep in sync with SQL)

app/(auth)/                    login, signup, forgot-password
app/onboarding/, app/pending/  Client signup → agreement → approval gate
app/(staff)/
  dashboard/                   Role-specific overview (admin / team_lead / employee)
  clients/                     Brand list + detail
  tasks/                       Internal task list, board, detail, new
  tickets/                     Client ticket list, detail, new (staff-facing)
  urgent/                      Unassigned urgent pool
  team/                        Workload, team_lead's department view
  reports/                     Performance reports
  admin/                       Users, approvals, agreement, settings (admin-only)
app/portal/                    Client-facing: dashboard, tickets, profile, services
app/api/                       Admin invite, agreement accept, notify

components/
  tasks/, tickets/             Forms, tables, detail-page widgets for each
  team/, clients/, admin/      Role-specific widgets
  portal/                      Client portal components
  ui/                          Hand-written primitives (button, badges, modal, cards)

supabase/migrations/           Full schema history, numbered — run in order
```

---

## Deploy
Deployed on Vercel: `https://agency-crm-gilt-sigma.vercel.app`.

```bash
npx vercel --prod
```
Set the env vars from step 4 above in Vercel → Project → Settings → Environment Variables.
