-- 0061_risk_knowledge.sql
-- Risk Knowledge: one unified catalog for four platform-wide,
-- staff-maintained vocabularies -- Threat Types, Risk Types,
-- Treatments (which "Mitigations" is a treatment_type = 'mitigate'
-- subset of, not a separate category), and Industries. See
-- Risk-Intelligence/src/types.ts's own doc comment on
-- RiskKnowledgeEntry for the full reasoning, including why Business
-- Assets and Dependencies -- named alongside these in the original
-- proposal -- are deliberately NOT included here: both are a
-- genuinely different shape (org-specific and relational,
-- respectively), not a fifth and sixth category of this same flat
-- catalog.

BEGIN;

CREATE TABLE IF NOT EXISTS risk_knowledge_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        TEXT NOT NULL CHECK (category IN ('threat_type', 'risk_type', 'treatment', 'industry')),
    key             TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    -- Only meaningful when category = 'treatment' -- enforced at the
    -- service layer (createRiskKnowledgeEntry requires it there,
    -- rejects it everywhere else), not by a SQL CHECK constraint,
    -- since expressing "required for one category, forbidden for the
    -- other three" cleanly in SQL would be more awkward than useful.
    treatment_type  TEXT CHECK (treatment_type IN ('avoid', 'mitigate', 'transfer', 'accept')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- key is unique WITHIN its own category, not globally -- separate
    -- namespaces, matching the type's own doc comment.
    UNIQUE (category, key)
);

CREATE INDEX IF NOT EXISTS idx_risk_knowledge_entries_category ON risk_knowledge_entries(category, name);

COMMIT;
