-- 0049_audit_evidence.sql
-- Audit Evidence: the last of the six areas an operator asked for.
-- Deliberately staff-attached, not auto-collected -- Command Center
-- has no telemetry access into a customer's actual AI usage (that
-- stays in Aegis, same architecture boundary every other per-org
-- domain in this codebase respects) and no automated way to verify a
-- control is genuinely being followed. What it CAN honestly do is let
-- staff record what evidence exists on file -- a signed attestation,
-- a link to an audit log export, a screenshot reference -- and keep
-- an auditable trail of who attached it and when.
--
-- target_type/target_id are a deliberately open reference, not a hard
-- foreign key into compliance_controls or policies specifically --
-- same "domain-agnostic open string" reasoning as ApprovalRequest's
-- own source_type/source_id and Publishing's PublishableIntelligence.
-- Evidence for a Control and evidence for a Policy are the same shape
-- of record; a closed union would mean inventing a new table the
-- moment a third target type showed up.

BEGIN;

CREATE TABLE IF NOT EXISTS audit_evidence (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type           TEXT NOT NULL,
    target_id             TEXT NOT NULL,
    evidence_type         TEXT NOT NULL CHECK (evidence_type IN ('document', 'log_reference', 'attestation', 'other')),
    description           TEXT NOT NULL,
    reference_url         TEXT,
    attached_by_staff_id  UUID NOT NULL REFERENCES staff_users(id),
    attached_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_evidence_target ON audit_evidence(target_type, target_id);

COMMIT;
