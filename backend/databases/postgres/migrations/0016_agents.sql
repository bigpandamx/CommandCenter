-- 0016_agents.sql
-- Staff-facing task automation (Control-Plane/Agents), adapted from
-- Aegis's own AgentOrchestrator (docs/AGENT_SYSTEM.md). See
-- CUTOVER.md and Control-Plane/Agents/src/types.ts for the full
-- reasoning.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_tasks (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capability     TEXT NOT NULL CHECK (capability IN (
                       'flag_stale_tickets', 'audit_threat_intel',
                       'audit_compliance_sources', 'monitor_risk_insights'
                   )),
    priority       TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    payload        JSONB NOT NULL DEFAULT '{}',
    status         TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    result         JSONB,
    error          TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_priority ON agent_tasks(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_capability ON agent_tasks(capability, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_stats (
    agent_id          TEXT PRIMARY KEY,
    total_tasks       INTEGER NOT NULL DEFAULT 0,
    successful_tasks  INTEGER NOT NULL DEFAULT 0
);

COMMIT;
