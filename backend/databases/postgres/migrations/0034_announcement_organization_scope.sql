-- 0034_announcement_organization_scope.sql
-- Adds organization_id to announcements: the schema change needed for
-- Impact Assessment's Distribution stage to create real, targeted
-- Announcement rows instead of a broadcast that would reach every
-- customer org regardless of whether they're actually affected.
--
-- Nullable, and deliberately so: null preserves every existing
-- announcement's meaning exactly as before (a true broadcast to the
-- given audience). Non-null scopes this specific announcement to one
-- organization, in ADDITION to its existing audience filter -- an
-- org-scoped announcement with audience='customers' is still only
-- relevant to "customers" readers, just narrowed to one org within
-- that audience rather than all of them.
--
-- organization_id is intentionally NOT part of UpdateAnnouncementInput
-- (see announcementService.ts) -- who an announcement was created for
-- isn't meant to be re-targeted after the fact via a generic edit.

BEGIN;

ALTER TABLE announcements
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Supports the org-aware distribution pull specifically: "give me
-- broadcasts (organization_id IS NULL) OR announcements scoped to my
-- org," still filtered by the existing status/audience/expiry index.
CREATE INDEX IF NOT EXISTS idx_announcements_organization ON announcements(organization_id) WHERE organization_id IS NOT NULL;

COMMIT;
