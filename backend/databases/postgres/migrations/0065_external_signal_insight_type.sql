-- 0065_external_signal_insight_type.sql
-- Extends network_risk_insights.type's own CHECK constraint to allow
-- 'external_signal' -- a significant, discrete EVENT reported by an
-- outside source (a critical or known-exploited CVE), genuinely
-- different from the four detector-computed PATTERN types
-- (anomaly/trend/root_cause/correlation) the column originally
-- supported. See Risk-Intelligence/src/types.ts's own doc comment on
-- InsightType/DetectorGeneratedInsightType for the full reasoning,
-- including why this new type deliberately does NOT go through
-- Risk Models -- there's no threshold to tune for "NVD already
-- classified this as critical."

BEGIN;

ALTER TABLE network_risk_insights DROP CONSTRAINT IF EXISTS network_risk_insights_type_check;
ALTER TABLE network_risk_insights ADD CONSTRAINT network_risk_insights_type_check
    CHECK (type IN ('anomaly', 'trend', 'root_cause', 'correlation', 'external_signal'));

-- Supports getMostRecentExternalSignalInsightCreatedAt's own cursor
-- lookup -- a partial index since external_signal rows are a small
-- minority of all insights.
CREATE INDEX IF NOT EXISTS idx_network_risk_insights_external_signal
    ON network_risk_insights(created_at DESC)
    WHERE type = 'external_signal';

COMMIT;
