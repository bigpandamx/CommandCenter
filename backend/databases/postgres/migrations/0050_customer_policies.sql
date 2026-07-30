-- 0050_customer_policies.sql
-- Customer Policy mapping: explicitly scoped out when Controls
-- (0036_compliance_controls.sql) was first built, named rather than
-- silently dropped -- "an org's own internal policy documents mapping
-- onto a control." This is that deferred piece.
--
-- Structurally the same shape as compliance_frameworks/compliance_packs
-- (a named entity, many-to-many with compliance_controls), for the
-- same reason: a customer's own policy document can plausibly cover
-- more than one control (an "AI Usage Policy" might address both
-- transparency and audit-logging controls), and a single control can
-- be covered by more than one of an org's policies over time.
--
-- Genuinely different from both existing near-neighbors, not a
-- duplicate of either:
--   - Governance's own Policy (0047_governance.sql) is Command
--     Center's OWN platform-wide governance statement, staff-authored,
--     with no organization_id at all. CustomerPolicy is the opposite:
--     the CUSTOMER's own document, always scoped to one org.
--   - AuditEvidence (0049_audit_evidence.sql) is a flat, unversioned
--     supporting record attached to an existing target (a hard
--     delete, no lifecycle). CustomerPolicy is itself a first-class,
--     reviewable entity with its own many-to-many control mapping and
--     review workflow -- closer in shape to Framework/Pack than to a
--     piece of evidence attached to one.
--
-- organization_id is NOT NULL and has no "platform-wide" option --
-- unlike Governance's Policy, a customer policy that isn't about a
-- specific customer isn't a customer policy at all.
--
-- No policies are seeded here, matching Frameworks/Packs/Controls'
-- own established practice: deciding what a specific customer's
-- policy document actually covers is real compliance-team judgment,
-- not something to fabricate a placeholder mapping for.

BEGIN;

CREATE TABLE IF NOT EXISTS customer_policies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    description           TEXT NOT NULL,
    document_url          TEXT,
    status                TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
    submitted_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by_staff_id  UUID REFERENCES staff_users(id),
    reviewed_at           TIMESTAMPTZ,
    review_notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_policies_org ON customer_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_policies_status ON customer_policies(status);

CREATE TABLE IF NOT EXISTS customer_policy_controls (
    customer_policy_id  UUID NOT NULL REFERENCES customer_policies(id) ON DELETE CASCADE,
    control_id          UUID NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_policy_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_policy_controls_control ON customer_policy_controls(control_id);

COMMIT;
