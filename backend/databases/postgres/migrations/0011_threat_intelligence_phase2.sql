-- 0011_threat_intelligence_phase2.sql
-- Phase 2 of Control-Plane/Threat-Intelligence: consent management,
-- observation reporting, and the data-sharing audit trail. See
-- CUTOVER.md and src/observations.ts / src/consent.ts for the full
-- reasoning, including the deliberate correctness improvement over
-- Aegis's original report_threat_observation (distinct-org counting via
-- a real observations table instead of an unconditional counter
-- increment).

BEGIN;

CREATE TABLE IF NOT EXISTS organization_consents (
    organization_id       UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    share_risk_signals    BOOLEAN NOT NULL DEFAULT false,
    share_threat_patterns BOOLEAN NOT NULL DEFAULT false,
    share_benchmark_data  BOOLEAN NOT NULL DEFAULT false,
    anonymization_level   TEXT NOT NULL DEFAULT 'high' CHECK (anonymization_level IN ('high', 'medium', 'low')),
    data_retention_days   INTEGER NOT NULL DEFAULT 365,
    consent_version       TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS threat_pattern_observations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_pattern_id    UUID NOT NULL REFERENCES threat_patterns(id) ON DELETE CASCADE,
    organization_hash    TEXT NOT NULL,
    industry             TEXT,
    severity_score       REAL NOT NULL CHECK (severity_score >= 0.0 AND severity_score <= 1.0),
    occurred_at          TIMESTAMPTZ NOT NULL,
    received_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pattern_observations_pattern ON threat_pattern_observations(threat_pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_observations_pattern_org ON threat_pattern_observations(threat_pattern_id, organization_hash);

CREATE TABLE IF NOT EXISTS network_data_sharing_logs (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id               UUID REFERENCES organizations(id) ON DELETE SET NULL,
    organization_hash             TEXT NOT NULL,
    data_type                     TEXT NOT NULL CHECK (data_type IN ('risk_signal', 'threat_observation', 'benchmark_data')),
    record_count                  INTEGER NOT NULL,
    anonymization_applied         BOOLEAN NOT NULL,
    differential_privacy_applied  BOOLEAN NOT NULL,
    consent_version               TEXT NOT NULL,
    sharing_purpose               TEXT NOT NULL,
    retention_until               TIMESTAMPTZ NOT NULL,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_sharing_logs_org ON network_data_sharing_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_sharing_logs_retention ON network_data_sharing_logs(retention_until);

COMMIT;
