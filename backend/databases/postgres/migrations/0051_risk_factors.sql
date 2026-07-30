-- 0051_risk_factors.sql
-- Risk Factors: a named taxonomy of risk DIMENSIONS ("AI Model Risk,"
-- "Vendor Risk," "Data Governance Risk"), classifying NetworkRiskInsight
-- rows -- deliberately NOT a requirement hierarchy over
-- compliance_controls the way compliance_frameworks/pack_controls are.
-- See Risk-Intelligence/src/types.ts's own doc comment on RiskFactor
-- for the full reasoning: a risk factor doesn't REQUIRE an insight to
-- exist the way a framework requires a control: insights are detected
-- first, algorithmically, bottom-up; a risk factor is a classification
-- lens a staff member applies afterward. The junction table below
-- reflects that directly -- it links insights to factors, and touches
-- nothing in the compliance schema at all.

BEGIN;

CREATE TABLE IF NOT EXISTS risk_factors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key          TEXT NOT NULL UNIQUE,  -- stable identifier, e.g. "ai-model-risk"
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insight_risk_factors (
    insight_id      UUID NOT NULL REFERENCES network_risk_insights(id) ON DELETE CASCADE,
    risk_factor_id  UUID NOT NULL REFERENCES risk_factors(id) ON DELETE CASCADE,
    classified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (insight_id, risk_factor_id)
);
CREATE INDEX IF NOT EXISTS idx_insight_risk_factors_factor ON insight_risk_factors(risk_factor_id);

COMMIT;
