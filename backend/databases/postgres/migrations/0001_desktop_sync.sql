-- 0001_desktop_sync.sql
-- Schema for the Aegis Desktop <-> Command Center sync protocol.
-- Mirrors the domain types in Customer-Connections/Desktop-Apps/src/types.ts.
--
-- Tenant isolation note (per established Aegis convention): every table that
-- is not itself `organizations` carries `organization_id` and every query
-- against it MUST filter on it. Do not add a route or query against these
-- tables without an org_id scope -- this is the #1 recurring vuln class
-- across this project.

BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    entitlement_tier  TEXT NOT NULL CHECK (entitlement_tier IN ('trial', 'standard', 'enterprise')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enrollment_tokens (
    token             TEXT PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    consumed_at       TIMESTAMPTZ,
    max_uses          INTEGER NOT NULL DEFAULT 1,
    use_count         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_org ON enrollment_tokens(organization_id);

CREATE TABLE IF NOT EXISTS devices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_hash      TEXT NOT NULL,
    fingerprint       TEXT NOT NULL,
    display_name      TEXT NOT NULL,
    platform          TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
    app_version       TEXT NOT NULL,
    channel           TEXT NOT NULL CHECK (channel IN ('stable', 'beta', 'canary')) DEFAULT 'stable',
    status            TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'suspended')) DEFAULT 'active',
    enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_checkin_at   TIMESTAMPTZ,
    -- A given machine fingerprint should map to exactly one device per org,
    -- so re-enrollment (see enrollDevice) can find-and-rotate instead of duplicating.
    UNIQUE (organization_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_devices_org ON devices(organization_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_checkin ON devices(last_checkin_at);

CREATE TABLE IF NOT EXISTS pending_commands (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id         UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type              TEXT NOT NULL CHECK (type IN ('update_now', 'revoke', 'rotate_key', 'resync_config')),
    payload           JSONB,
    issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pending_commands_device ON pending_commands(device_id) WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pending_commands_org ON pending_commands(organization_id);

-- Update manifests are NOT org-scoped -- they describe Aegis desktop
-- releases published by Aegis engineering, visible to all orgs on the
-- matching channel/platform. This is the one desktop-sync table that is
-- intentionally global.
CREATE TABLE IF NOT EXISTS update_manifests (
    version           TEXT NOT NULL,
    channel           TEXT NOT NULL CHECK (channel IN ('stable', 'beta', 'canary')),
    platform          TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
    published_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    download_url      TEXT NOT NULL,
    sha256            TEXT NOT NULL,
    min_upgrade_from  TEXT,
    PRIMARY KEY (version, channel, platform)
);
CREATE INDEX IF NOT EXISTS idx_update_manifests_lookup ON update_manifests(channel, platform, published_at DESC);

COMMIT;
