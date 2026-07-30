-- 0044_announcement_scheduled_publish.sql
-- Distribution Center: staff choose when a draft alert actually goes
-- out -- Publish Immediately, Tomorrow, a custom Schedule, or stay a
-- Draft. A schedule only ever applies to a draft; publishing (whether
-- triggered manually or by the due-schedule sweep) clears it.

BEGIN;

ALTER TABLE announcements
    ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;

-- Supports listDueScheduledAnnouncements' real query shape: drafts
-- with a schedule at or before now. Partial index -- most
-- announcements never have a schedule set at all, so indexing only
-- the ones that do keeps this small and useful rather than padding an
-- index with mostly-null rows.
CREATE INDEX IF NOT EXISTS idx_announcements_scheduled_publish_at
    ON announcements(scheduled_publish_at)
    WHERE scheduled_publish_at IS NOT NULL;

COMMIT;
