-- 0013_threat_intelligence_benchmarks.sql
-- Risk signal aggregation and industry benchmarks -- the final piece of
-- Control-Plane/Threat-Intelligence's migration from Aegis's Network
-- Intelligence system. See CUTOVER.md, src/riskSignals.ts, and
-- src/benchmarks.ts for the full reasoning, including the k-anonymity
-- floor (sample_size >= 10, matching Aegis's own CheckConstraint) and
-- the numpy-equivalent percentile calculation.

BEGIN;

CREATE TABLE IF NOT EXISTS risk_signal_aggregates (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_hash        TEXT NOT NULL,
    signal_type              TEXT NOT NULL CHECK (signal_type IN (
                                  'deployment_failure', 'policy_violation', 'audit_anomaly', 'prompt_injection',
                                  'data_leakage', 'bias_detection', 'performance_degradation', 'compliance_gap',
                                  'security_incident'
                              )),
    industry                 TEXT NOT NULL,
    signal_count             INTEGER NOT NULL CHECK (signal_count >= 0),
    total_deployments_count  INTEGER NOT NULL,
    avg_severity_score       REAL NOT NULL CHECK (avg_severity_score >= 0.0 AND avg_severity_score <= 1.0),
    max_severity_score       REAL NOT NULL CHECK (max_severity_score >= 0.0 AND max_severity_score <= 1.0),
    noise_epsilon            REAL NOT NULL,
    aggregation_window_hours INTEGER NOT NULL DEFAULT 24,
    signal_start_time        TIMESTAMPTZ NOT NULL,
    signal_end_time          TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_signal_industry_time ON risk_signal_aggregates(industry, signal_start_time);
CREATE INDEX IF NOT EXISTS idx_risk_signal_type_industry ON risk_signal_aggregates(signal_type, industry);

CREATE TABLE IF NOT EXISTS industry_benchmarks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry              TEXT NOT NULL,
    metric                TEXT NOT NULL CHECK (metric IN ('risk_score', 'deployment_failure_rate', 'policy_violation_rate')),
    benchmark_period      TEXT NOT NULL,
    percentile_10         REAL NOT NULL,
    percentile_25         REAL NOT NULL,
    percentile_50         REAL NOT NULL,
    percentile_75         REAL NOT NULL,
    percentile_90         REAL NOT NULL,
    mean_value            REAL NOT NULL,
    std_deviation         REAL NOT NULL,
    sample_size           INTEGER NOT NULL CHECK (sample_size >= 10),
    total_data_points     INTEGER NOT NULL,
    min_value             REAL NOT NULL,
    max_value             REAL NOT NULL,
    confidence_score      REAL NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    data_quality_score    REAL NOT NULL CHECK (data_quality_score >= 0.0 AND data_quality_score <= 1.0),
    calculated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until           TIMESTAMPTZ NOT NULL,
    UNIQUE (industry, metric, benchmark_period)
);
CREATE INDEX IF NOT EXISTS idx_benchmark_lookup ON industry_benchmarks(industry, metric, benchmark_period);

COMMIT;
