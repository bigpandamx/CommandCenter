-- 0064_playbooks.sql
-- Playbooks: the one genuinely new piece of the Risk Library -- an
-- ordered response procedure, kept OUT of risk_knowledge_entries'
-- unified catalog because it's a genuinely different shape (steps, not
-- a single named thing). See Risk-Intelligence/src/types.ts's own doc
-- comment on Playbook for the full reasoning, including why steps are
-- stored as JSONB on the playbook itself rather than as rows in their
-- own table.

BEGIN;

CREATE TABLE IF NOT EXISTS playbooks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key          TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    -- Array of {title, description}, ordered by array position.
    steps        JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many with risk_factors -- "is there a playbook for this kind
-- of risk," the same junction-table shape insight_risk_factors already
-- uses.
CREATE TABLE IF NOT EXISTS playbook_risk_factors (
    playbook_id     UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    risk_factor_id  UUID NOT NULL REFERENCES risk_factors(id) ON DELETE CASCADE,
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (playbook_id, risk_factor_id)
);
CREATE INDEX IF NOT EXISTS idx_playbook_risk_factors_factor ON playbook_risk_factors(risk_factor_id);

COMMIT;
