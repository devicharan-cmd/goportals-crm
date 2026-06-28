# GoPortals Agency CRM

Internal CRM, ticketing, and reporting system for GoPortals.

## Stack
- **Next.js 14** (App Router)
- **Supabase** (Postgres + Auth + Realtime)
- **Tailwind CSS** + shadcn/ui
- **TypeScript**

---

## Setup (15 minutes)

### 1. Install dependencies
```bash
cd agency-crm
npm install
```

### 2. Create Supabase project
1. Go to [supabase.com](https://supabase.com) → New project
2. Wait for it to finish provisioning

### 3. Run the database schema
1. In Supabase Dashboard → **SQL Editor** → **New Query**
2. Paste the entire contents of `supabase/migrations/001_schema.sql`
3. Click **Run** — this creates all tables, triggers, RLS policies, and seeds your team

### 4. Set environment variables
```bash
cp .env.local.example .env.local
```
Open `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase → Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase → Settings → API → anon public key

### 5. Create auth users for your team
In Supabase Dashboard → **Authentication** → **Users** → **Add user** for each team member. 

Then in SQL Editor, link each auth user to their team_member row:
```sql
-- Run once per team member after creating their auth user
UPDATE team_members
SET user_id = 'paste-auth-user-uuid-here'
WHERE email = 'sahilgupta@goportals.co';
```

### 6. Start the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
agency-crm/
├── app/
│   ├── (auth)/login/          → Login page
│   └── (dashboard)/
│       ├── layout.tsx          → Sidebar + TopBar shell
│       ├── dashboard/          → Overview with KPIs + recent tickets
│       ├── clients/            → Client list, add brand, brand detail
│       ├── tickets/            → Kanban board, create ticket, ticket detail
│       ├── team/               → Team workload dashboard
│       ├── reports/            → Performance reports + renewal alerts
│       └── notifications/      → In-app notifications
├── components/
│   ├── shared/                 → Sidebar, TopBar
│   ├── clients/                → ClientForm
│   └── tickets/                → TicketForm, TicketStatusUpdater, CommentBox
├── lib/supabase/               → Supabase client (browser + server + middleware)
├── types/index.ts              → All TypeScript types + enums + constants
└── supabase/migrations/001_schema.sql  → Full DB schema
```

---

## Key Features

| Feature | Where |
|---|---|
| Add a brand | `/clients/new` |
| Assign 2 team members per brand | Auto-based on service type in ClientForm |
| Create ticket for a brand | `/tickets/new?client_id=...` or from brand detail |
| Kanban board view | `/tickets` |
| Amazon case ID field | `external_ref` on every ticket |
| Team workload & capacity | `/team` |
| Reports + renewal alerts | `/reports` |

---

## Service Type → Team Assignment Rules

| Service Type | Member 1 | Member 2 |
|---|---|---|
| Onboarding & Setup | Setup & Listing | Reporting & Grievance |
| Full Account Management | Ads Management | Operations |
| Ads Only | Ads Management | Reporting & Grievance |

---

## Deploy to Vercel

```bash
npx vercel --prod
```
Add the two env vars in Vercel dashboard → Project → Settings → Environment Variables.
