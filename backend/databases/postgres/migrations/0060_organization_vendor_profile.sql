-- 0060_organization_vendor_profile.sql
-- Organization Profile enrichment: the org's own disclosed
-- infrastructure/vendor footprint (cloud providers, AI providers,
-- device types). Explicit, disclosed data the org already trusts
-- Command Center with, the same way industry/country already are --
-- NOT derived from Risk Intelligence's own anonymized cross-org
-- signal aggregates (Threat-Intelligence/src/riskSignals.ts's real
-- differential privacy), and genuinely unrelated to that boundary.
-- What makes "a critical OpenAI outage" resolvable to specific,
-- actually-affected organizations instead of an industry-wide guess.
--
-- Arrays, not scalars -- a real org is often multi-cloud or uses more
-- than one AI provider, and a single-value field would force a false
-- choice. Default empty, not null -- an org that hasn't disclosed a
-- vendor footprint yet is an ordinary, ongoing state (most orgs won't
-- fill this in immediately after signup), not an error.

BEGIN;

ALTER TABLE organization_profiles
    ADD COLUMN IF NOT EXISTS cloud_providers TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS ai_providers TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS device_types TEXT[] NOT NULL DEFAULT '{}';

-- GIN indexes -- what findOrganizationsUsingVendor's own "any org
-- whose array contains this vendor" query needs to stay a real,
-- indexed lookup rather than a full table scan as the org base grows.
CREATE INDEX IF NOT EXISTS idx_organization_profiles_cloud_providers ON organization_profiles USING GIN (cloud_providers);
CREATE INDEX IF NOT EXISTS idx_organization_profiles_ai_providers ON organization_profiles USING GIN (ai_providers);
CREATE INDEX IF NOT EXISTS idx_organization_profiles_device_types ON organization_profiles USING GIN (device_types);

COMMIT;
