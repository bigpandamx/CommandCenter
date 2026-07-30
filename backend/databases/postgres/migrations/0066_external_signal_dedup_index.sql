-- 0066_external_signal_dedup_index.sql
-- Supports hasExternalSignalInsightForSource's own per-entity dedup
-- query -- a real, indexed lookup rather than a sequential scan over
-- every external_signal insight ever created. Needed because at least
-- one real signal source (MITRE campaign sync) unconditionally bumps
-- updated_at on every re-sync even with no meaningful change -- a
-- cursor alone would re-match and re-generate an insight for the same
-- still-active campaign every single run; this per-source-entity check
-- is the actual, authoritative guard against that.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_network_risk_insights_external_signal_source
    ON network_risk_insights ((contributing_factors->>'source'), (contributing_factors->>'sourceReferenceId'))
    WHERE type = 'external_signal';

COMMIT;
