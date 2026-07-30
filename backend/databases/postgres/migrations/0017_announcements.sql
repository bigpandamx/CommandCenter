-- 0017_announcements.sql
-- Staff-authored broadcast announcements (Control-Plane/Announcements).
-- Genuinely new, not migrated -- see CUTOVER.md and src/types.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS announcements (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                 TEXT NOT NULL,
    body                  TEXT NOT NULL,
    audience              TEXT NOT NULL CHECK (audience IN ('staff', 'customers', 'all')),
    severity              TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    status                TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
    created_by_staff_id   UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at          TIMESTAMPTZ,
    expires_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_announcements_status_created ON announcements(status, created_at DESC);
-- Supports the active-announcement read path (status='published' AND
-- audience matches AND not-yet-expired), the one this table is actually
-- queried by most often (every admin-portal page load, eventually every
-- Aegis distribution pull).
CREATE INDEX IF NOT EXISTS idx_announcements_active_lookup ON announcements(status, audience, expires_at);

COMMIT;
