-- 0052_risk_models.sql
-- Risk Models: detectors.ts's own already-proven thresholds (baseline
-- minimum 5, spike >20%, severity bands at 80/60/40, ...) made into a
-- real, staff-inspectable, staff-editable configuration -- not
-- fabricated numbers, the literal values already running today, given
-- a name and a place to live. One row per detector type
-- (anomaly/trend/root_cause/correlation), since each detector's
-- thresholds are genuinely independent, not shared math. Deliberately
-- not versioned -- edited in place, no historical snapshot kept; see
-- Risk-Intelligence/src/types.ts's own doc comment on RiskModel for
-- why that's a stated scope boundary.
--
-- No models are seeded here, matching this codebase's established
-- practice (Controls, Packs, Frameworks, Risk Factors all started
-- empty) -- when no row is active for a detector type,
-- resolveActiveModelParameters falls back to that detector's own
-- hardcoded default, so nothing needs seeding for the system to keep
-- working exactly as it already does today.

BEGIN;

CREATE TABLE IF NOT EXISTS risk_models (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key          TEXT NOT NULL UNIQUE,  -- stable identifier, e.g. "standard-anomaly-detection"
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    detector_type TEXT NOT NULL CHECK (detector_type IN ('anomaly', 'trend', 'root_cause', 'correlation')),
    parameters   JSONB NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports getActiveRiskModelForDetectorType's own real, indexed
-- lookup -- a partial index since most detector types will have no
-- active model most of the time.
CREATE INDEX IF NOT EXISTS idx_risk_models_active_by_type
    ON risk_models(detector_type)
    WHERE is_active = true;

COMMIT;
