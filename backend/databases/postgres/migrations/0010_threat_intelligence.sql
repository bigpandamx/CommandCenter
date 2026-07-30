-- 0010_threat_intelligence.sql
-- Cross-org threat pattern and prompt-abuse-signature library, migrated
-- from Aegis's network_intelligence.py (ThreatPattern, PromptAbuseSignature)
-- per CUTOVER.md. Phase 1 only: library + distribution. Both tables are
-- GLOBAL, not organization_id scoped -- same as compliance_updates and
-- update_manifests: a threat pattern is the same fact for every Aegis
-- deployment. Cross-org observation aggregation (incrementing
-- total_observations / affected_organizations_count) is Phase 2, not
-- built here -- those columns exist now so Phase 2 doesn't need a
-- follow-up ALTER, but nothing writes to them yet except at creation
-- (both default to 0).

BEGIN;

CREATE TABLE IF NOT EXISTS threat_patterns (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id                    TEXT NOT NULL UNIQUE,
    pattern_name                  TEXT NOT NULL,
    threat_type                   TEXT NOT NULL CHECK (threat_type IN (
                                       'deployment_failure', 'policy_violation', 'audit_anomaly', 'prompt_injection',
                                       'data_leakage', 'bias_detection', 'performance_degradation', 'compliance_gap',
                                       'security_incident'
                                   )),
    severity                      TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    description                   TEXT NOT NULL,
    attack_vector                 TEXT NOT NULL,
    indicators_of_compromise      JSONB,
    detection_signature           JSONB NOT NULL,
    confidence_threshold          REAL NOT NULL DEFAULT 0.8 CHECK (confidence_threshold >= 0.0 AND confidence_threshold <= 1.0),
    first_observed                TIMESTAMPTZ NOT NULL,
    last_observed                 TIMESTAMPTZ NOT NULL,
    total_observations            INTEGER NOT NULL DEFAULT 0,
    affected_organizations_count  INTEGER NOT NULL DEFAULT 0,
    affected_industries           JSONB,
    avg_severity_score            REAL NOT NULL CHECK (avg_severity_score >= 0.0 AND avg_severity_score <= 1.0),
    success_rate                  REAL CHECK (success_rate IS NULL OR (success_rate >= 0.0 AND success_rate <= 1.0)),
    estimated_prevalence          TEXT,
    mitigation_steps              JSONB,
    remediation_guidance          TEXT,
    is_active                     BOOLEAN NOT NULL DEFAULT true,
    is_false_positive             BOOLEAN NOT NULL DEFAULT false,
    verified_by_analyst           BOOLEAN NOT NULL DEFAULT false,
    external_references           JSONB,
    related_pattern_ids           JSONB,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_threat_patterns_active_severity ON threat_patterns(is_active, severity, last_observed DESC);
CREATE INDEX IF NOT EXISTS idx_threat_patterns_updated_at ON threat_patterns(updated_at DESC);

CREATE TABLE IF NOT EXISTS prompt_abuse_signatures (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_id               TEXT NOT NULL UNIQUE,
    signature_name             TEXT NOT NULL,
    category                   TEXT NOT NULL,
    pattern_regex               TEXT,
    pattern_keywords           JSONB,
    detection_logic            JSONB NOT NULL,
    match_threshold             REAL NOT NULL DEFAULT 0.85 CHECK (match_threshold >= 0.0 AND match_threshold <= 1.0),
    discovered_from_org_count   INTEGER NOT NULL DEFAULT 0,
    total_detections            INTEGER NOT NULL DEFAULT 0,
    false_positive_rate        REAL CHECK (false_positive_rate IS NULL OR (false_positive_rate >= 0.0 AND false_positive_rate <= 1.0)),
    severity                   TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    risk_score                 REAL NOT NULL CHECK (risk_score >= 0.0 AND risk_score <= 1.0),
    example_prompts             JSONB,
    is_active                  BOOLEAN NOT NULL DEFAULT true,
    is_experimental              BOOLEAN NOT NULL DEFAULT false,
    related_threat_pattern_id  UUID REFERENCES threat_patterns(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_detection               TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_prompt_abuse_signatures_active_category ON prompt_abuse_signatures(is_active, category);
CREATE INDEX IF NOT EXISTS idx_prompt_abuse_signatures_updated_at ON prompt_abuse_signatures(updated_at DESC);

COMMIT;
