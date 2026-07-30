-- 0054_risk_treatments.sql
-- Risk Treatments: the pipeline stage most likely to accidentally
-- become Controls with a different label -- see
-- Risk-Intelligence/src/types.ts's own doc comment on RiskTreatment
-- for the full reasoning. treatment_type uses the standard ISO 31000
-- vocabulary (avoid/mitigate/transfer/accept); 'accept' is a genuine,
-- valid, complete outcome, not a fallback -- Compliance has no
-- equivalent state, since an external mandate doesn't care whether
-- Command Center consents to it.
--
-- Tied to a specific network_risk_insight, not to a risk factor or an
-- industry -- a treatment responds to a concrete, detected issue.
-- Zero treatments for a given insight is an ordinary state, never
-- computed or surfaced as a gap anywhere in this schema.

BEGIN;

CREATE TABLE IF NOT EXISTS risk_treatments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id            UUID NOT NULL REFERENCES network_risk_insights(id) ON DELETE CASCADE,
    treatment_type        TEXT NOT NULL CHECK (treatment_type IN ('avoid', 'mitigate', 'transfer', 'accept')),
    description           TEXT NOT NULL,
    status                TEXT NOT NULL CHECK (status IN ('proposed', 'in_progress', 'completed')),
    proposed_by_staff_id  UUID NOT NULL,
    proposed_at           TIMESTAMPTZ NOT NULL,
    completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_risk_treatments_insight ON risk_treatments(insight_id, proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_treatments_type_status ON risk_treatments(treatment_type, status);

COMMIT;
