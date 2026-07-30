-- 0039_compliance_update_status.sql
-- The Incoming Queue: "think of this like an email inbox for
-- regulations." Every ComplianceUpdate today is immediately "just
-- there" the moment it's ingested -- available for analysis,
-- obligation extraction, rule grouping, everything -- with no concept
-- of "has anyone looked at this yet." This adds that.
--
-- Five states, not six: the original vision named "New" and "Pending
-- AI Analysis" as separate buckets, but this system has no actual
-- async job queue for analysis -- analyzeComplianceUpdate is a
-- synchronous function call, triggered explicitly. An update that
-- hasn't been analyzed IS the "pending AI analysis" state; there's no
-- real intermediate "analysis in progress" state to represent, so
-- modeling six states would mean inventing a distinction that doesn't
-- exist in this system's reality. 'new' covers both.
--
--   new            -- ingested (automated or manual), not yet analyzed
--   pending_review -- analysis completed; awaiting a staff decision
--   duplicate      -- staff-flagged as a duplicate of another tracked item
--                     (distinct from ingestion's own externalId-based
--                     dedup, which silently skips exact re-fetches
--                     before a row is even created -- this is for the
--                     same underlying regulation reported by two
--                     different sources, which ingestion has no way
--                     to detect automatically)
--   rejected       -- staff decided this shouldn't be used (spam,
--                     irrelevant, false positive)
--   published      -- staff-approved
--
-- Deliberately NOT wired into any downstream consumer this round
-- (impact assessment, control matching, rule grouping, distribution
-- all still operate on every update regardless of status) -- whether
-- "published" should gate those is a real, separate decision with
-- wide consequences, not something to decide silently as a side
-- effect of adding a status column.

BEGIN;

ALTER TABLE compliance_updates
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'pending_review', 'duplicate', 'rejected', 'published'));

CREATE INDEX IF NOT EXISTS idx_compliance_updates_status ON compliance_updates(status);

COMMIT;
