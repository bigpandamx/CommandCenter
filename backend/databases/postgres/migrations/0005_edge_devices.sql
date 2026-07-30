-- 0005_edge_devices.sql
-- Fleet management for Aegis enforcement agents, consolidated in from
-- Aegis's enforcement_agents / agent_events tables. See CUTOVER.md and
-- Customer-Connections/Edge-Devices/src/types.ts for the full context.
-- Org-scoped like everything else except the global catalogs (see 0001's
-- note on update_manifests / 0004's note on subscription_plans).

BEGIN;

CREATE TABLE IF NOT EXISTS edge_devices (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                     TEXT NOT NULL,
    description              TEXT,
    deployment_type          TEXT NOT NULL CHECK (deployment_type IN ('saas', 'hybrid', 'on_prem', 'vpc')),
    environment              TEXT,
    version                  TEXT,
    api_key_hash             TEXT NOT NULL,
    api_key_prefix           TEXT NOT NULL,
    status                   TEXT NOT NULL CHECK (status IN ('provisioning', 'active', 'degraded', 'offline', 'inactive')) DEFAULT 'provisioning',
    last_heartbeat           TIMESTAMPTZ,
    policy_snapshot_version  TEXT,
    last_policy_sync         TIMESTAMPTZ,
    pending_sync             BOOLEAN NOT NULL DEFAULT false,
    pending_sync_reason      TEXT,
    ip_allowlist             TEXT[],
    is_active                BOOLEAN NOT NULL DEFAULT true,
    metadata                 JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edge_devices_org_status ON edge_devices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_edge_devices_heartbeat_sweep ON edge_devices(status, last_heartbeat) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS edge_device_events (
    id                UUID PRIMARY KEY,
    edge_device_id    UUID NOT NULL REFERENCES edge_devices(id) ON DELETE CASCADE,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_id          TEXT NOT NULL UNIQUE,
    event_type        TEXT NOT NULL CHECK (event_type IN (
                          'heartbeat', 'agent_started', 'agent_stopped', 'config_reload',
                          'prompt_allowed', 'prompt_blocked', 'policy_violation',
                          'policy_sync_ack', 'error'
                      )),
    severity          TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',
    payload           JSONB,
    occurred_at       TIMESTAMPTZ,
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edge_device_events_device ON edge_device_events(edge_device_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_device_events_org ON edge_device_events(organization_id);

COMMIT;
