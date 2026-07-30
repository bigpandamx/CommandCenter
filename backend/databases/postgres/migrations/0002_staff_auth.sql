-- 0002_staff_auth.sql
-- Internal staff (Aegis employee/developer) authentication for Command
-- Center. Deliberately NOT tenant-scoped -- staff accounts are global,
-- unlike everything in 0001_desktop_sync.sql which is organization_id
-- scoped. Do not add organization_id here; a staff account managing
-- multiple customer orgs is the whole point.

BEGIN;

CREATE TABLE IF NOT EXISTS staff_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
    status          TEXT NOT NULL CHECK (status IN ('active', 'disabled')) DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_sessions (
    id              UUID PRIMARY KEY,
    staff_user_id   UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_user ON staff_sessions(staff_user_id);
-- Sessions past their TTL are useless rows; a scheduled job should prune
-- expires_at < now() periodically (not implemented yet -- see README).
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expiry ON staff_sessions(expires_at);

COMMIT;
