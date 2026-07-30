-- 0007_service_accounts.sql
-- Service accounts: machine-to-machine credentials for other services
-- (starting with Aegis's own backend) to call Command Center without a
-- human staff session. Closes the gap noted in CUTOVER.md. Global, not
-- org-scoped, same as staff_users -- a service account isn't tied to a
-- customer org, it's tied to another part of Aegis's own infrastructure.

BEGIN;

CREATE TABLE IF NOT EXISTS service_accounts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    description       TEXT,
    api_key_hash      TEXT NOT NULL,
    scopes            TEXT[] NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
    last_used_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at        TIMESTAMPTZ
);

COMMIT;
