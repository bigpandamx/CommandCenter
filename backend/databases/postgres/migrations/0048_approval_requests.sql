-- 0048_approval_requests.sql
-- Pending Approvals: the one item from the original Governance ask
-- with a genuinely real, structured source to build from --
-- AgentTask.result.recommendations. Every built-in agent
-- (flag_stale_tickets, audit_threat_intel, audit_compliance_sources,
-- monitor_risk_insights) already produces free-text recommendations a
-- human should act on; nothing turns those into a trackable
-- approve/reject decision. This does.
--
-- source_type/source_id are a deliberately open reference, not a
-- foreign key into agent_tasks specifically -- same "domain-agnostic
-- open string" reasoning as Publishing's own PublishableIntelligence.
-- agent_tasks is the only real source this round wires up, but a
-- future source (e.g. a suggested new Control from controlMatching.ts)
-- shouldn't need its own parallel approval concept.
--
-- Deliberately NOT auto-created by the orchestrator itself
-- (processNextTask) every time a task completes -- that would flood
-- the queue with a fresh duplicate every time a recurring agent run
-- rediscovers the same issue, and reaches into a module (Agents) this
-- one doesn't own. Conversion is an explicit, staff-triggered action
-- (approvalService.ts's createApprovalsFromTaskRecommendations),
-- idempotent on an existing PENDING request with the same
-- source/summary so re-triggering it doesn't create visible
-- duplicates for something a staff member hasn't acted on yet.

BEGIN;

CREATE TABLE IF NOT EXISTS approval_requests (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type           TEXT NOT NULL,
    source_id             TEXT NOT NULL,
    summary               TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by_staff_id   UUID REFERENCES staff_users(id),
    decided_at            TIMESTAMPTZ,
    decision_notes        TEXT
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_source ON approval_requests(source_type, source_id);

COMMIT;
