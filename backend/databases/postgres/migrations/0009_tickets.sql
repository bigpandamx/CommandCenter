-- 0009_tickets.sql
-- Ticket intake: problems reported against a customer org (or, with
-- organization_id null, an internal-only issue), routed to engineering
-- or support, tracked through resolution. organization_id references
-- organizations but is nullable and does NOT cascade-delete tickets --
-- an org being removed shouldn't silently destroy its support history,
-- so this uses ON DELETE SET NULL instead of CASCADE (deliberately
-- different from most other org-scoped tables in this schema, which do
-- cascade -- tickets are a historical record, not derived/regenerable
-- data like enrollment tokens or telemetry).

BEGIN;

CREATE TABLE IF NOT EXISTS tickets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
    subject               TEXT NOT NULL,
    description           TEXT NOT NULL,
    status                TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')) DEFAULT 'open',
    priority              TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    category              TEXT NOT NULL CHECK (category IN ('bug', 'billing', 'compliance', 'account', 'technical_support', 'feature_request', 'other')),
    team                  TEXT NOT NULL CHECK (team IN ('engineering', 'support')),
    assigned_to_staff_id  UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    reporter_name         TEXT,
    reporter_email        TEXT,
    source                TEXT NOT NULL CHECK (source IN ('customer', 'staff', 'system')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ,
    closed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status_team ON tickets(status, team);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assigned_to_staff_id);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC);
-- Reuse the trigram extension already enabled in 0008 for text search.
CREATE INDEX IF NOT EXISTS idx_tickets_text_trgm
    ON tickets USING GIN ((subject || ' ' || description) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id                UUID PRIMARY KEY,
    ticket_id         UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_staff_id   UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    body              TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at);

COMMIT;
