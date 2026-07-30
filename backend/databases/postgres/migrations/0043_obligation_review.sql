-- 0043_obligation_review.sql
-- Obligation Review: "your analysts verify before publishing." Every
-- ComplianceObligation today is auto-created by AI extraction and
-- immediately "live" -- used by control matching, impact assessment,
-- everything -- with no concept of a human having checked the AI's
-- work. This adds that, one layer more granular than the Incoming
-- Queue (which reviews whether a DOCUMENT should be looked at at all;
-- this reviews whether a SPECIFIC extracted requirement is accurate).
--
-- confidence is nullable: obligations that predate this feature, or a
-- model response that (incorrectly) omits it, have no confidence score
-- rather than a fabricated one.
--
-- Three states, not four: "Merge" from the original vision is not a
-- fourth status -- it's an action that sets merged_into_obligation_id
-- and rejects the merged-away obligation, non-destructively (no data
-- is deleted, no fields are combined). This is the same design choice
-- ComplianceUpdate.status made for "duplicate" -- a relationship to
-- record, not a status of its own.
--
-- Same as ComplianceUpdate.status: NOT wired into any downstream
-- consumer yet (control matching, impact assessment still consider
-- every obligation regardless of review status) -- a separate,
-- deliberate decision with real consequences, not a silent side effect
-- of adding a column.

BEGIN;

ALTER TABLE compliance_obligations
    ADD COLUMN IF NOT EXISTS confidence INTEGER CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved', 'rejected')),
    ADD COLUMN IF NOT EXISTS merged_into_obligation_id UUID REFERENCES compliance_obligations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_obligations_status ON compliance_obligations(status);

COMMIT;
