-- 0035_compliance_rules.sql
-- Compliance Knowledge: the missing layer between "thousands of
-- disconnected ingested documents" and an actual regulatory topic that
-- evolves over time. A Federal Register "AI Transparency Rule,"
-- published Monday, its correction Tuesday, and its implementation
-- guidance next week are three ComplianceUpdate rows today with no
-- relationship between them. A ComplianceRule groups them.
--
-- History and Current Version are deliberately NOT separate concepts
-- to store: History is just every compliance_updates row with this
-- rule_id, and Current Version is derived (the most recently published
-- one) rather than a manually-set pointer that could go stale relative
-- to the actual history. See ruleService.ts's own doc comment for the
-- full reasoning.
--
-- rule_id is nullable on compliance_updates -- most ingested documents
-- won't belong to a rule at all; grouping is an explicit, deliberate
-- staff action (or a future automated match), not something every
-- update needs.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key           TEXT NOT NULL UNIQUE,  -- stable identifier, e.g. "ai-transparency-rule"
    name          TEXT NOT NULL,          -- e.g. "AI Transparency Rule"
    description   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE compliance_updates
    ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES compliance_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_updates_rule ON compliance_updates(rule_id) WHERE rule_id IS NOT NULL;

-- Related Rules: a real graph, same shape as service_dependencies --
-- self-referencing, symmetric in practice (if A relates to B, the
-- reverse is queried too -- see listRelatedRuleIds), CHECK preventing
-- a trivial self-relation.
CREATE TABLE IF NOT EXISTS compliance_rule_relationships (
    rule_id            UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    related_rule_id    UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    PRIMARY KEY (rule_id, related_rule_id),
    CHECK (rule_id != related_rule_id)
);

-- Interpretation: AI-synthesized across a rule's FULL history (the
-- original rule, its correction, its guidance, considered together),
-- not per-update analysis re-purposed -- that already exists
-- (ComplianceAnalysis) and answers a different question (what does
-- THIS ONE document mean). Persisted, same reasoning as
-- ComplianceAnalysis: real AI calls cost real money and latency, so
-- this is generated on an explicit action and cached, not recomputed
-- on every read. based_on_update_count is the staleness signal -- if
-- the rule's history has grown since this was generated, the stored
-- interpretation no longer reflects the full picture.
CREATE TABLE IF NOT EXISTS compliance_rule_interpretations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id                  UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    interpretation           TEXT NOT NULL,
    key_changes              TEXT[] NOT NULL DEFAULT '{}',
    current_risk_level       TEXT NOT NULL CHECK (current_risk_level IN ('low', 'medium', 'high', 'critical')),
    current_action_items     TEXT[] NOT NULL DEFAULT '{}',
    model                    TEXT NOT NULL,
    based_on_update_count    INTEGER NOT NULL,
    synthesized_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rule_interpretations_rule_synthesized ON compliance_rule_interpretations(rule_id, synthesized_at DESC);

COMMIT;
