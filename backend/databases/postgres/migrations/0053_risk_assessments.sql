-- 0053_risk_assessments.sql
-- Risk Assessments: persisted, industry-scoped exposure SNAPSHOTS --
-- "what is our exposure, right now, and how has it changed over
-- time." A computed aggregate over NetworkRiskInsight rows that
-- already exist, not a new fact the way an Obligation or Control is;
-- the only reason this persists at all (rather than being computed
-- live on demand) is the explicit choice to support real trend
-- tracking. See Risk-Intelligence/src/riskAssessmentService.ts's own
-- doc comment for the exact scoring formula.

BEGIN;

CREATE TABLE IF NOT EXISTS risk_assessments (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry                 TEXT NOT NULL,
    assessed_at              TIMESTAMPTZ NOT NULL,
    exposure_score           NUMERIC NOT NULL,
    exposure_level           TEXT NOT NULL CHECK (exposure_level IN ('low', 'medium', 'high', 'critical')),
    contributing_insight_ids UUID[] NOT NULL DEFAULT '{}'
);

-- Supports the trend view (listRiskAssessmentsForIndustry, newest
-- first) and getLatestRiskAssessmentForIndustry.
CREATE INDEX IF NOT EXISTS idx_risk_assessments_industry_assessed_at
    ON risk_assessments(industry, assessed_at DESC);

COMMIT;
