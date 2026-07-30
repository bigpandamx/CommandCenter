-- 0029_compliance_normalization.sql
-- Compliance's normalization layer, restructured around the pipeline
-- framing (Collection -> Normalization -> AI Analysis -> Knowledge Base
-- -> Impact Assessment -> Distribution). See
-- Control-Plane/Compliance/src/types.ts's module doc comment for the
-- full reasoning.
--
-- jurisdiction (a single free-text blob) is replaced by structured
-- country/state. category is renamed documentType (same values, no
-- semantic change -- a rename, not a redesign). content and
-- effective_date are new columns.
--
-- No data backfill: this schema has never run against a real database
-- with real ingested rows in this session (same situation as every
-- other migration built this way this session -- see CUTOVER.md).
-- Existing jurisdiction values are dropped, not migrated into
-- country/state, since a real backfill would need the same
-- parseUsJurisdiction-style parsing the application layer already
-- does (see ingestion.ts) -- duplicating that logic in SQL here would
-- be a second, divergence-prone implementation of the same rule, not
-- a shortcut.

BEGIN;

ALTER TABLE compliance_updates RENAME COLUMN category TO document_type;

ALTER TABLE compliance_updates DROP COLUMN IF EXISTS jurisdiction;
ALTER TABLE compliance_updates ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE compliance_updates ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE compliance_updates ADD COLUMN IF NOT EXISTS industries TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE compliance_updates ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE compliance_updates ADD COLUMN IF NOT EXISTS effective_date TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_compliance_updates_jurisdiction;
-- Country is the primary impact-matching dimension going forward (an
-- organization's region is a country, not a source's free-text
-- jurisdiction label) -- state is a secondary refinement, so a
-- composite index with country first serves both "all US documents"
-- and "US-CA specifically" queries.
CREATE INDEX IF NOT EXISTS idx_compliance_updates_country_state ON compliance_updates(country, state);
CREATE INDEX IF NOT EXISTS idx_compliance_updates_industries ON compliance_updates USING GIN (industries);

COMMIT;
