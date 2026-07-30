-- 0042_fleet_operations.sql
-- Fleet Operations: every deployed customer Aegis instance reports its
-- own status into Command Center. One row per heartbeat, not one row
-- per org overwritten in place -- see
-- Control-Plane/FleetOperations/src/types.ts's module doc comment for
-- why (a live dashboard needs "what's true right now," a real,
-- related question needs "how has this trended").

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_heartbeats (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version                 TEXT NOT NULL,
    installed_modules       TEXT[] NOT NULL DEFAULT '{}',
    license_state           TEXT NOT NULL CHECK (license_state IN ('active', 'trial', 'expired', 'suspended', 'unknown')),
    health_score            INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
    failed_job_count        INTEGER NOT NULL DEFAULT 0,
    pending_migration_count INTEGER NOT NULL DEFAULT 0,
    received_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports listLatestHeartbeats' real query shape: DISTINCT ON
-- (organization_id) ordered by (organization_id, received_at DESC) --
-- this composite index lets Postgres satisfy that ordering directly
-- rather than sorting the whole table.
CREATE INDEX IF NOT EXISTS idx_fleet_heartbeats_org_received_at ON fleet_heartbeats(organization_id, received_at DESC);

COMMIT;
