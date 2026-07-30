-- 0018_announcement_acknowledgments.sql
-- Per-staff dismiss/acknowledge tracking for the admin-portal banner --
-- see Control-Plane/Announcements/src/types.ts's doc comment on
-- AnnouncementAcknowledgment for why this is staff-only, not extended
-- to the "customers" audience.

BEGIN;

CREATE TABLE IF NOT EXISTS announcement_acknowledgments (
    announcement_id  UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    staff_user_id    UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, staff_user_id)
);
CREATE INDEX IF NOT EXISTS idx_announcement_ack_staff ON announcement_acknowledgments(staff_user_id);

COMMIT;
