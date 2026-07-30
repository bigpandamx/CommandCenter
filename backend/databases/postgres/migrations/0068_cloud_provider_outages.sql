-- 0068_cloud_provider_outages.sql
-- Cloud/AI Provider Outages: staff-reported outage records -- see
-- Risk-Intelligence/src/types.ts's own doc comment on
-- CloudProviderOutage for the full reasoning, including why this is
-- deliberately staff-reported rather than a live-ingestion adapter
-- against a real provider status page this environment has no way to
-- verify. vendor/category reuse the same open-vocabulary vendor
-- fields OrganizationProfile and asset_dependencies already use.

BEGIN;

CREATE TABLE IF NOT EXISTS cloud_provider_outages (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor                TEXT NOT NULL,
    category              TEXT NOT NULL CHECK (category IN ('cloud', 'ai', 'device')),
    title                 TEXT NOT NULL,
    description           TEXT NOT NULL,
    severity              TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    affected_services     JSONB NOT NULL DEFAULT '[]',
    started_at            TIMESTAMPTZ NOT NULL,
    is_resolved           BOOLEAN NOT NULL DEFAULT false,
    resolved_at           TIMESTAMPTZ,
    source_url            TEXT,
    reported_by_staff_id  UUID NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What listCloudProviderOutages' own vendor/category filtering and
-- assessOutageImpact's own repeated lookups need to stay indexed.
CREATE INDEX IF NOT EXISTS idx_cloud_provider_outages_vendor_category ON cloud_provider_outages(vendor, category, started_at DESC);

COMMIT;
