-- 0003_telemetry.sql
-- Storage for batched telemetry events from Aegis desktop installs
-- (POST /v1/telemetry). Org-scoped like everything in 0001 -- see that
-- migration's tenant-isolation note, same rule applies here.

BEGIN;

CREATE TABLE IF NOT EXISTS telemetry_events (
    id                UUID PRIMARY KEY,
    device_id         UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type              TEXT NOT NULL CHECK (type IN ('conmon_report', 'usage_metric', 'error_report', 'health_snapshot')),
    payload           JSONB NOT NULL,
    occurred_at       TIMESTAMPTZ NOT NULL,
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_org_received ON telemetry_events(organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_device ON telemetry_events(device_id);

-- Telemetry volume grows without bound if nothing prunes it. No retention
-- job exists yet -- see README's "not yet built" note. Whoever adds one
-- should filter on received_at, not occurred_at (a late-arriving backfilled
-- event shouldn't be immediately eligible for deletion).

COMMIT;
