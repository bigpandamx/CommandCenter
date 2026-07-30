-- 0036_compliance_controls.sql
-- Layer 3 of the three-layer compliance model: Legal Source
-- (compliance_sources) -> Obligation (compliance_obligations, extracted
-- automatically by AI) -> Control (this table).
--
-- The point of this layer: without it, an obligation from the EU AI
-- Act, an obligation from FTC guidance, and an obligation from the
-- Colorado AI Act that all really mean "disclose when a user is
-- interacting with AI" would exist as three unrelated records with
-- nothing connecting them -- the same problem ComplianceRule solved
-- for documents-about-the-same-topic, one layer up. A control is the
-- canonical, deduplicated statement of a requirement; many obligations
-- across many jurisdictions map onto the same one. An org's compliance
-- posture becomes "which of ~50 controls do we satisfy," not "which of
-- 500 obligations do we satisfy" -- and a brand-new regulation's
-- obligations can often map onto controls an org already satisfies,
-- turning a full compliance review into an incremental gap check.
--
-- code is a short, human-facing label (e.g. "CTRL-001") distinct from
-- key (the stable, slug-style identifier used everywhere else in this
-- schema for programmatic reference) -- matches this codebase's
-- established key-vs-display-name split (categories, rules, services),
-- with code as an additional citation-friendly label controls
-- specifically benefit from (matching how the user's own example
-- referred to controls by code, not by a descriptive slug).

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_controls (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key           TEXT NOT NULL UNIQUE,  -- stable identifier, e.g. "ai-transparency"
    code          TEXT NOT NULL UNIQUE,  -- short human-facing label, e.g. "CTRL-001"
    name          TEXT NOT NULL,          -- e.g. "AI Transparency"
    description   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many, deliberately not many-to-one: a single obligation
-- ("must document AI decision logic and retain it for audit") can
-- plausibly touch more than one control theme (transparency AND audit
-- logging), and a single control is by definition satisfied by many
-- obligations across many sources.
CREATE TABLE IF NOT EXISTS obligation_control_mappings (
    obligation_id    UUID NOT NULL REFERENCES compliance_obligations(id) ON DELETE CASCADE,
    control_id       UUID NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    -- Whether this mapping was proposed by the AI matcher or set by a
    -- staff member -- an AI-proposed mapping is exactly the kind of
    -- inference worth being able to distinguish from a deliberate human
    -- judgment call, the same "don't let inferred and asserted data
    -- look identical" reasoning applied elsewhere in this schema (e.g.
    -- ComplianceUpdate.country's ingestion-vs-analysis distinction).
    source           TEXT NOT NULL CHECK (source IN ('ai', 'staff')),
    mapped_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (obligation_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_obligation_control_mappings_control ON obligation_control_mappings(control_id);

COMMIT;
