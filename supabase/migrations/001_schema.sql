-- ============================================================
-- AGENCY CRM - Full Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE lifecycle_stage AS ENUM (
  'onboarding',
  'setup',
  'scale',
  'retention',
  'churned'
);

CREATE TYPE service_type AS ENUM (
  'onboarding_setup',
  'full_account_management',
  'ads_only'
);

CREATE TYPE member_role AS ENUM (
  'admin',
  'team_lead',
  'member'
);

CREATE TYPE ticket_status AS ENUM (
  'open',
  'in_progress',
  'in_review',
  'done',
  'blocked'
);

CREATE TYPE ticket_priority AS ENUM (
  'P1',
  'P2',
  'P3',
  'P4'
);

CREATE TYPE ticket_type AS ENUM (
  'task',
  'issue',
  'request',
  'grievance'
);

CREATE TYPE platform AS ENUM (
  'amazon',
  'flipkart',
  'myntra',
  'blinkit',
  'meesho',
  'nykaa',
  'other'
);

CREATE TYPE work_role AS ENUM (
  'ads_management',
  'operations',
  'reporting_grievance',
  'setup_listing'
);

CREATE TYPE notification_type AS ENUM (
  'ticket_assigned',
  'ticket_due_soon',
  'ticket_overdue',
  'stage_changed',
  'sla_breach',
  'renewal_due',
  'comment_added'
);

-- ============================================================
-- TEAM MEMBERS
-- ============================================================

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  department TEXT,
  weekly_capacity_hours INTEGER NOT NULL DEFAULT 40,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLIENTS (BRANDS)
-- ============================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  industry TEXT,
  service_type service_type NOT NULL,
  lifecycle_stage lifecycle_stage NOT NULL DEFAULT 'onboarding',
  health_score INTEGER CHECK (health_score BETWEEN 0 AND 100),

  -- Contact info
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  whatsapp_group_link TEXT,

  -- Contract
  contract_start DATE,
  contract_end DATE,
  monthly_retainer NUMERIC(10,2),

  -- Team assignment (2 members per client based on service type)
  primary_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  secondary_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  primary_work_role work_role,
  secondary_work_role work_role,

  -- Platforms they sell on
  platforms platform[] DEFAULT '{}',

  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TICKETS
-- ============================================================

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,

  -- Relations
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reporter_id UUID REFERENCES team_members(id) ON DELETE SET NULL,

  -- Classification
  type ticket_type NOT NULL DEFAULT 'task',
  status ticket_status NOT NULL DEFAULT 'open',
  priority ticket_priority NOT NULL DEFAULT 'P3',
  platform platform,

  -- For Amazon/marketplace case IDs
  external_ref TEXT,

  -- Timing
  due_date DATE,
  estimated_hours NUMERIC(4,1) DEFAULT 3.0,
  actual_hours NUMERIC(4,1),

  -- Hierarchy
  parent_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,

  -- Auto-generated flag (from onboarding checklist)
  is_auto_generated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- ============================================================
-- TICKET BLOCKERS (many-to-many: ticket blocks ticket)
-- ============================================================

CREATE TABLE ticket_blockers (
  blocking_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  blocked_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (blocking_ticket_id, blocked_ticket_id)
);

-- ============================================================
-- COMMENTS
-- ============================================================

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TIME LOGS
-- ============================================================

CREATE TABLE time_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  hours NUMERIC(4,1) NOT NULL,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ACTIVITY LOG (audit trail for tickets)
-- ============================================================

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  action TEXT NOT NULL,   -- e.g. 'status_changed', 'assignee_changed', 'comment_added'
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_tickets_client_id ON tickets(client_id);
CREATE INDEX idx_tickets_assignee_id ON tickets(assignee_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_due_date ON tickets(due_date);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_comments_ticket_id ON comments(ticket_id);
CREATE INDEX idx_time_logs_ticket_id ON time_logs(ticket_id);
CREATE INDEX idx_time_logs_member_id ON time_logs(member_id);
CREATE INDEX idx_activity_logs_ticket_id ON activity_logs(ticket_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-CLOSE TICKET: set closed_at when status → done
-- ============================================================

CREATE OR REPLACE FUNCTION set_ticket_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.closed_at = NOW();
  ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_closed_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_ticket_closed_at();

-- ============================================================
-- AUTO-CREATE ONBOARDING CHECKLIST on new client
-- ============================================================

CREATE OR REPLACE FUNCTION create_onboarding_tickets()
RETURNS TRIGGER AS $$
DECLARE
  checklist_items TEXT[] := ARRAY[
    'Brand onboarding call & scope alignment',
    'Gather brand assets (logo, brand kit, product images)',
    'Set up seller account / verify access',
    'Product listing audit',
    'Keyword research & competitor analysis',
    'Create/optimize first 10 product listings',
    'Set up brand store',
    'Initial ads campaign setup',
    'Reporting dashboard setup',
    'Handover & kickoff confirmation'
  ];
  item TEXT;
BEGIN
  IF NEW.lifecycle_stage = 'onboarding' THEN
    FOREACH item IN ARRAY checklist_items LOOP
      INSERT INTO tickets (
        title, client_id, assignee_id, type, priority, is_auto_generated, status
      ) VALUES (
        item,
        NEW.id,
        NEW.primary_member_id,
        'task',
        'P2',
        true,
        'open'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_onboarding_checklist
  AFTER INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION create_onboarding_tickets();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all core data
CREATE POLICY "Authenticated users can view team_members"
  ON team_members FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view clients"
  ON clients FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view tickets"
  ON tickets FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view comments"
  ON comments FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view time_logs"
  ON time_logs FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view activity_logs"
  ON activity_logs FOR SELECT USING (auth.role() = 'authenticated');

-- Notifications: only the recipient
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (
    recipient_id = (SELECT id FROM team_members WHERE user_id = auth.uid())
  );

-- Insert/Update/Delete policies (authenticated users can do everything for now — tighten per role later)
CREATE POLICY "Authenticated can insert clients"
  ON clients FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update clients"
  ON clients FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert tickets"
  ON tickets FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update tickets"
  ON tickets FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert comments"
  ON comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert time_logs"
  ON time_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert team_members"
  ON team_members FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update team_members"
  ON team_members FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================
-- SEED: your real team
-- ============================================================

-- NOTE: Run AFTER creating auth users, then link user_id manually
-- OR insert without user_id for now and link later

INSERT INTO team_members (name, email, role, weekly_capacity_hours) VALUES
  ('Sahil Gupta',  'sahilgupta@goportals.co', 'admin',     40),
  ('Vivek',        'vivek@goportals.co',       'team_lead', 40),
  ('Amit',         'amit@goportals.co',         'member',    40),
  ('Nandani',      'nandani@goportals.co',      'member',    40);
