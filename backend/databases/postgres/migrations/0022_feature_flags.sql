-- 0022_feature_flags.sql
-- Feature flags: runtime-toggleable kill switches and percentage
-- rollouts, owned locally by Command Center -- not a cross-system
-- service. Aegis has its own mirrored, independently-owned equivalent
-- (see Aegis's app/models/feature_flag.py); the two are NOT the same
-- table and don't sync with each other. A flag gating an Aegis-side
-- behavior lives in Aegis's own table; a flag gating a Command
-- Center-side behavior lives here. This keeps flag evaluation a purely
-- local, always-available operation on both sides -- no new critical-path
-- dependency on the other system just to check whether a feature is on.
--
-- rollout_percentage is evaluated per-organization via a stable hash of
-- (flag key, organization id), not per-request -- the same org always
-- lands in the same bucket for a given flag, rather than randomly
-- flipping between enabled/disabled across requests.

BEGIN;

CREATE TABLE IF NOT EXISTS feature_flags (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                  TEXT NOT NULL UNIQUE,
    description          TEXT NOT NULL,
    enabled              BOOLEAN NOT NULL DEFAULT false,
    rollout_percentage   INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
