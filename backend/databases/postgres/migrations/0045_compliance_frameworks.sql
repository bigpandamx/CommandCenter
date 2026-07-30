-- 0045_compliance_frameworks.sql
-- Compliance Frameworks: named external standards (NIST AI RMF, ISO
-- 42001, ISO 27001, SOC 2, HIPAA, PCI DSS, GDPR, EU AI Act, ...) as
-- real entities with their own required control sets -- "not rules,
-- collections of controls." Same many-to-many shape as
-- 0037_compliance_packs.sql's pack_controls, and for the same
-- structural reason: a control can satisfy more than one framework
-- (e.g. an AI Transparency control plausibly maps onto both NIST AI
-- RMF and the EU AI Act), and a framework requires many controls.
--
-- Deliberately distinct from the existing frameworkTags TEXT[] on
-- compliance_sources/compliance_updates -- that's informal, per-
-- document tagging ("this source's content tends to relate to the EU
-- AI Act"), explicitly documented as "not a hard filter." This table
-- is the opposite: a formal, queryable taxonomy of which controls a
-- named framework actually requires, enabling real coverage tracking
-- ("how many of ISO 42001's required controls do we actually have
-- backed by real regulatory analysis"). The two concepts are allowed
-- to coexist without being unified -- they serve different points in
-- the pipeline (document-level informal tagging vs. control-level
-- formal requirement tracking) and forcing them into one model would
-- blur a real distinction.
--
-- No frameworks are seeded here, deliberately -- matching this
-- codebase's established practice of not pre-populating Controls,
-- Packs, or Sources with fabricated data. Deciding which controls
-- actually satisfy NIST AI RMF vs. ISO 42001 vs. HIPAA is real
-- compliance-team judgment work, not something to invent placeholder
-- mappings for. The capability is what this migration adds; staff
-- create the actual frameworks and their real control mappings
-- through the admin UI, the same way Controls and Packs already work.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_frameworks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key          TEXT NOT NULL UNIQUE,  -- stable identifier, e.g. "iso-42001"
    name         TEXT NOT NULL,          -- e.g. "ISO/IEC 42001:2023"
    description  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS framework_controls (
    framework_id  UUID NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
    control_id    UUID NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (framework_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_framework_controls_control ON framework_controls(control_id);

COMMIT;
