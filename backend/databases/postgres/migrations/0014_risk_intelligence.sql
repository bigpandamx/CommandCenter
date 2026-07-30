-- 0014_risk_intelligence.sql
-- Network risk insights: cross-org anomaly/trend/root-cause/correlation
-- detection, adapted from Aegis's per-org RiskIntelligenceService. Reads
-- risk_signal_aggregates (owned by Threat-Intelligence's 0013 migration)
-- read-only; this migration only adds the insight-storage table.

BEGIN;

CREATE TABLE IF NOT EXISTS network_risk_insights (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry              TEXT NOT NULL,
    type                  TEXT NOT NULL CHECK (type IN ('anomaly', 'trend', 'root_cause', 'correlation')),
    severity              TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    summary               TEXT NOT NULL,
    explanation           TEXT NOT NULL,
    contributing_factors  JSONB NOT NULL DEFAULT '{}',
    recommendation        TEXT NOT NULL,
    confidence            REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    linked_aggregate_ids  JSONB NOT NULL DEFAULT '[]',
    is_resolved           BOOLEAN NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_network_risk_insights_industry_type ON network_risk_insights(industry, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_risk_insights_unresolved ON network_risk_insights(is_resolved, created_at DESC);

COMMIT;
