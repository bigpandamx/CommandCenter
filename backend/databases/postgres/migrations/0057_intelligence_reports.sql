-- 0057_intelligence_reports.sql
-- Intelligence Reports: a genuinely distinct concept from Threat
-- Advisories (advisoryGeneration.ts), not a duplicate of it. An
-- Advisory is short, tactical, mechanically generated from exactly
-- one verified ThreatPattern, and published through the same
-- customer-facing Distribution Center flow as a compliance alert. An
-- Intelligence Report is the opposite in every dimension: longer-form
-- analyst prose, can synthesize across many patterns/actors/CVEs at
-- once (e.g. "Q3 2026 Ransomware Landscape" citing three actors, five
-- patterns, two CVEs), and is a staff knowledge-base artifact --
-- deliberately NOT routed through Announcements/Publishing in this
-- first pass. Distributing reports to customers is Advisories'
-- already-solved job; duplicating that pipeline here would blur a
-- distinction worth keeping sharp, not add real capability.
--
-- status is "draft" | "published" -- published here means "finalized,
-- visible in the main list by default," not "distributed to
-- customers." A draft is still being written and is hidden from the
-- default list view the same way a draft shouldn't clutter a
-- knowledge base before it's ready.
--
-- related_pattern_ids / related_actor_ids / related_vulnerability_cve_ids
-- are plain TEXT[] cross-references, not join tables -- the same
-- choice ThreatPattern.relatedPatternIds and ThreatActor.
-- relatedPatternIds already made for the identical kind of loose,
-- read-mostly cross-reference. A report doesn't need referential
-- integrity against a pattern that's since been deleted; it needs to
-- keep citing what it cited even if the citation goes stale, the same
-- way a published paper's bibliography doesn't get silently rewritten
-- if a source disappears.

BEGIN;

CREATE TABLE IF NOT EXISTS intelligence_reports (
    id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                          TEXT NOT NULL,
    summary                        TEXT NOT NULL,
    body                           TEXT NOT NULL,
    related_pattern_ids            TEXT[],
    related_actor_ids              TEXT[],
    related_vulnerability_cve_ids  TEXT[],
    status                         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    authored_by_staff_id           UUID NOT NULL REFERENCES staff_users(id),
    published_at                   TIMESTAMPTZ,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intelligence_reports_status ON intelligence_reports(status);
CREATE INDEX IF NOT EXISTS idx_intelligence_reports_published_at ON intelligence_reports(published_at);

COMMIT;
