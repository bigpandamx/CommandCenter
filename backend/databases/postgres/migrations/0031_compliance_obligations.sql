-- 0031_compliance_obligations.sql
-- Knowledge Base layer (Control-Plane/Compliance/src/analysisService.ts,
-- ComplianceObligation in types.ts): the Obligations tier of the
-- Law -> Topics -> Obligations -> Industries hierarchy. One-to-many
-- from compliance_updates -- a single document can impose several
-- distinct obligations with different industry applicability and
-- deadlines, which the existing action_items TEXT[] on
-- compliance_analyses can't represent (that's recommendations TO a
-- customer, this is requirements FROM the document itself).

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_obligations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_id             UUID NOT NULL REFERENCES compliance_updates(id) ON DELETE CASCADE,
    description           TEXT NOT NULL,
    obligation_type       TEXT NOT NULL,
    industries            TEXT[] NOT NULL DEFAULT '{}',
    deadline_description  TEXT,
    -- Computed deterministically in application code from
    -- deadline_description + the parent update's effective_date (see
    -- parseRelativeDeadline) -- never written by the AI directly, since
    -- LLMs are unreliable at date arithmetic. Null when no deadline was
    -- given or the description didn't match a recognized pattern.
    deadline_date         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports replaceObligationsForUpdate (delete-then-insert per update)
-- and listObligationsForUpdate directly.
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_update ON compliance_obligations(update_id);
-- Supports listObligationsByIndustry -- the actual "Industries" layer
-- of the knowledge hierarchy, queried directly rather than requiring a
-- scan of every document's obligations.
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_industries ON compliance_obligations USING GIN (industries);
-- Supports listUpcomingObligations ("what's due soon"). Partial index
-- (WHERE deadline_date IS NOT NULL) since most obligations won't have a
-- computed date -- indexing NULLs here would be pure waste.
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_deadline ON compliance_obligations(deadline_date) WHERE deadline_date IS NOT NULL;

COMMIT;
