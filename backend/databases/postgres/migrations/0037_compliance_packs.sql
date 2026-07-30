-- 0037_compliance_packs.sql
-- Compliance Packs: the piece of the original Impact Assessment vision
-- (Organization -> Region -> Products -> Industry -> AI Usage ->
-- Compliance Packs -> Affected: YES/NO) left as a named, deliberate
-- follow-up when country/industry matching shipped. A pack bundles
-- canonical Controls (Layer 3) that become relevant when an org has a
-- specific product -- e.g. an "AI Chat Compliance Pack" bundling every
-- control relevant to running an AI chat product, triggered by the org
-- actually having that product, not by country/industry alone.
--
-- required_product_keys is a plain TEXT[], not a join table -- same
-- choice already made for ComplianceObligation.industries, and for the
-- same reason: this is an OR-match list ("relevant if the org has ANY
-- of these products"), not something queried from the other direction
-- (no "which packs require product X" lookup exists), so a join table
-- would add structure without adding a real capability.
--
-- AI Usage, the third named-but-unmatched dimension, is deliberately
-- NOT modeled here at all -- there is no real AI usage telemetry
-- anywhere in this codebase (Service.usageMeterKey is metadata only,
-- confirmed by searching before designing anything), and inventing a
-- fake signal to look complete would be worse than leaving the gap
-- named. Same "honestly scoped to what's reliably matchable today"
-- policy country/industry matching already established.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_packs (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                    TEXT NOT NULL UNIQUE,  -- stable identifier, e.g. "ai-chat-compliance-pack"
    name                   TEXT NOT NULL,          -- e.g. "AI Chat Compliance Pack"
    description            TEXT NOT NULL,
    required_product_keys  TEXT[] NOT NULL DEFAULT '{}',  -- ServiceCatalog service keys; empty means "not yet scoped to any product"
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many, same shape as obligation_control_mappings: a pack
-- bundles many controls, and a control can belong to more than one
-- pack (e.g. AI Audit Logging is relevant to both an "AI Chat" pack
-- and a "Voice AI" pack).
CREATE TABLE IF NOT EXISTS pack_controls (
    pack_id      UUID NOT NULL REFERENCES compliance_packs(id) ON DELETE CASCADE,
    control_id   UUID NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pack_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_pack_controls_control ON pack_controls(control_id);

COMMIT;
