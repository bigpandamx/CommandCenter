-- 0030_compliance_analysis.sql
-- AI Analysis layer (Control-Plane/Compliance/src/analysisService.ts):
-- the AI's own structured determination for a compliance_updates row,
-- stored SEPARATELY from it rather than as columns added to it -- see
-- ComplianceAnalysis's doc comment in types.ts for why (provenance:
-- what the source declared vs. what was inferred stays distinguishable).
--
-- One row per update (UNIQUE on update_id) -- re-analysis replaces the
-- existing row (application-layer upsert), not a history table. See
-- ComplianceAnalysis's doc comment for why versioning isn't built here.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_analyses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_id         UUID NOT NULL UNIQUE REFERENCES compliance_updates(id) ON DELETE CASCADE,
    is_ai_related     BOOLEAN NOT NULL,
    enforceability    TEXT NOT NULL CHECK (enforceability IN ('enforceable', 'informational', 'unknown')),
    country           TEXT,
    state             TEXT,
    industries        TEXT[] NOT NULL DEFAULT '{}',
    topics            TEXT[] NOT NULL DEFAULT '{}',
    summary           TEXT NOT NULL,
    risk_level        TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    action_items      TEXT[] NOT NULL DEFAULT '{}',
    keywords          TEXT[] NOT NULL DEFAULT '{}',
    model             TEXT NOT NULL,
    analyzed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The actual work-queue query (listUpdatesWithoutAnalysis): updates
-- with no matching compliance_analyses row -- a LEFT JOIN ... WHERE
-- compliance_analyses.id IS NULL anti-join. compliance_updates.id is
-- already indexed natively (it's that table's own PRIMARY KEY); the
-- UNIQUE constraint on compliance_analyses.update_id above already
-- indexes the other side of the join. No additional index needed for
-- this query beyond what the two constraints already provide.
CREATE INDEX IF NOT EXISTS idx_compliance_analyses_risk_level ON compliance_analyses(risk_level);
CREATE INDEX IF NOT EXISTS idx_compliance_analyses_industries ON compliance_analyses USING GIN (industries);

COMMIT;
