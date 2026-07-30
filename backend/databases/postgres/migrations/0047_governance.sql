-- 0047_governance.sql
-- Governance Console: an operator needs more than a single narrow
-- "Compliance Agent" that only checks whether ingestion sources are
-- failing to fetch. This is the first of that broader surface --
-- Policy and PolicyViolation, modeled natively in Command Center as
-- platform-level governance data (a deliberate choice: this is NOT a
-- mirror of Aegis's own per-org Policy/AutomationRule records, which
-- stay exactly where they are, same "per-org data stays in Aegis"
-- reasoning already established for every other Aegis-side domain in
-- this codebase -- this is Command Center's own, platform-wide
-- governance layer).
--
-- policies: a staff-authored governance statement, structurally
-- mirroring compliance_frameworks and compliance_packs on purpose --
-- a named entity with a many-to-many relationship to
-- compliance_controls via policy_controls. The semantic direction
-- differs (a Framework is REQUIRED to be satisfied; a Policy
-- IMPLEMENTS/enforces the controls it's linked to), but there's no
-- reason for the CRUD/mapping shape itself to differ.
--
-- policy_violations: deliberately staff-reported, not auto-detected.
-- Command Center has no automated signal that would let it honestly
-- claim "this policy was violated" -- same "don't fabricate detection
-- that doesn't exist" discipline already applied to Manual Sources and
-- Threat Intelligence's reported observations. organization_id is
-- nullable: a violation can be platform-wide (no specific org at
-- fault) or scoped to one org.

BEGIN;

CREATE TABLE IF NOT EXISTS policies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key           TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_controls (
    policy_id     UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    control_id    UUID NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (policy_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_policy_controls_control ON policy_controls(control_id);

CREATE TABLE IF NOT EXISTS policy_violations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id             UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    organization_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
    description           TEXT NOT NULL,
    severity              TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    reported_by_staff_id  UUID NOT NULL REFERENCES staff_users(id),
    reported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ,
    resolution_notes      TEXT
);
CREATE INDEX IF NOT EXISTS idx_policy_violations_policy ON policy_violations(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_status ON policy_violations(status);
CREATE INDEX IF NOT EXISTS idx_policy_violations_org ON policy_violations(organization_id);

COMMIT;
