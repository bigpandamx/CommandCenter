-- 0041_platform_health_request_latency.sql
-- Platform Health's fourth capability: Latency By Service. One row per
-- HTTP request through backend/api, recorded by a Fastify
-- onRequest/onResponse hook pair registered once (see
-- PlatformHealth/src/requestLatencyTracking.ts), not per-route
-- instrumentation.
--
-- Every request is recorded, not sampled -- see RequestLatencyRecord's
-- own doc comment in types.ts for the reasoning and the explicit
-- "revisit if volume becomes a real problem" scoping note.

BEGIN;

CREATE TABLE IF NOT EXISTS request_latency_records (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service        TEXT NOT NULL,
    method         TEXT NOT NULL,
    route_pattern  TEXT NOT NULL,
    status_code    INTEGER NOT NULL,
    latency_ms     INTEGER NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports listRequestLatenciesSince's two real query shapes:
-- "everything since X" and "everything since X for service Y" -- same
-- reasoning as ai_call_records' own indexes.
CREATE INDEX IF NOT EXISTS idx_request_latency_occurred_at ON request_latency_records(occurred_at);
CREATE INDEX IF NOT EXISTS idx_request_latency_service_occurred_at ON request_latency_records(service, occurred_at);

COMMIT;
