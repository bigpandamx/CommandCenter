-- 0006_compliance.sql
-- Compliance intelligence: regulatory news/law/guidance tracking, pulled
-- from external sources for Aegis to consume. See
-- Control-Plane/Compliance/src/types.ts for the "sources not verified
-- live" caveat and CUTOVER.md for context.
--
-- Both tables here are GLOBAL, not organization_id scoped -- unlike
-- almost everything else in this schema. A new EU AI Act amendment is
-- the same fact for every Aegis customer; there's nothing to tenant-
-- isolate. Compare to update_manifests (0001) and subscription_plans
-- (0004), the other global catalogs.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_sources (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    jurisdiction        TEXT NOT NULL,
    framework_tags      TEXT[] NOT NULL DEFAULT '{}',
    source_type         TEXT NOT NULL CHECK (source_type IN ('rss', 'atom', 'json_api')),
    url                 TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    last_fetched_at     TIMESTAMPTZ,
    last_fetch_status   TEXT NOT NULL CHECK (last_fetch_status IN ('never_run', 'success', 'error')) DEFAULT 'never_run',
    last_fetch_error    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_updates (
    id                UUID PRIMARY KEY,
    source_id         UUID NOT NULL REFERENCES compliance_sources(id) ON DELETE CASCADE,
    external_id       TEXT NOT NULL,
    title             TEXT NOT NULL,
    summary           TEXT,
    url               TEXT NOT NULL,
    jurisdiction      TEXT NOT NULL,
    framework_tags    TEXT[] NOT NULL DEFAULT '{}',
    category          TEXT NOT NULL CHECK (category IN ('new_law', 'amendment', 'proposed_rule', 'guidance', 'enforcement_action', 'news')),
    published_at      TIMESTAMPTZ,
    ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_updates_ingested ON compliance_updates(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_updates_jurisdiction ON compliance_updates(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_compliance_updates_framework_tags ON compliance_updates USING GIN (framework_tags);

COMMIT;
