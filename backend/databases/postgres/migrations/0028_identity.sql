-- 0028_identity.sql
-- Platform-Services/Identity: human-readable global display IDs
-- (ORG-00001234, TKT-00129283), generated alongside -- not replacing
-- -- the UUID primary keys used everywhere else in this codebase. See
-- Platform-Services/Identity/src/types.ts's module doc comment for the
-- full reasoning and scoping decision.
--
-- One counter TABLE (not N native Postgres SEQUENCE objects, one per
-- kind) because `kind` is an open, free-form string here (matching
-- this codebase's own established convention for Events' `type` and
-- FeatureFlags' `key` -- see types.ts), not a fixed set known in
-- advance. A real SEQUENCE object has to be CREATEd ahead of time for
-- a specific name; a counter table lets an unseen kind self-initialize
-- via UPSERT on first use, with no migration required to introduce a
-- new kind. The atomic UPDATE ... RETURNING below is still safe under
-- concurrent callers -- Postgres row-level locking serializes
-- concurrent writers to the same (kind) row, the same guarantee a
-- native SEQUENCE provides, just scoped per-kind instead of per-column.

BEGIN;

CREATE TABLE IF NOT EXISTS id_sequences (
    kind        TEXT PRIMARY KEY,
    next_value  BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS display_id TEXT;
-- Existing rows (if any real deployment already has tickets) get
-- backfilled with a value derived from their existing UUID's insertion
-- order, not a fabricated-looking sequential number that would collide
-- with what generateDisplayId assigns going forward. A real backfill
-- generating genuine TKT-NNNNNNNN values for pre-existing rows is an
-- operational step to run once via the application layer (which knows
-- how to call generateDisplayId correctly), not embedded as SQL here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_display_id ON tickets(display_id) WHERE display_id IS NOT NULL;

COMMIT;
