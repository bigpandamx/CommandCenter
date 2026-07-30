-- 0063_asset_dependencies.sql
-- Asset Dependencies: the relationship layer Business Assets was
-- deliberately built without -- see
-- Risk-Intelligence/src/types.ts's own doc comment on AssetDependency
-- for the full reasoning. Points at exactly one of two targets
-- (another business_asset, or a vendor/category pair), discriminated
-- by target_type; enforced at the service layer (createAssetDependency
-- requires the right fields for whichever type applies, rejects the
-- other's), not by a SQL CHECK constraint, matching the same choice
-- risk_knowledge_entries' own treatment_type made.

BEGIN;

CREATE TABLE IF NOT EXISTS asset_dependencies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Denormalized from the dependent asset's own organization_id --
    -- avoids a join on every org-scoped lookup.
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dependent_asset_id      UUID NOT NULL REFERENCES business_assets(id) ON DELETE CASCADE,
    target_type             TEXT NOT NULL CHECK (target_type IN ('asset', 'vendor')),
    target_asset_id         UUID REFERENCES business_assets(id) ON DELETE CASCADE,
    target_vendor           TEXT,
    target_vendor_category  TEXT CHECK (target_vendor_category IN ('cloud', 'ai', 'device')),
    description             TEXT NOT NULL,
    -- How badly the DEPENDENT asset suffers if this specific target
    -- goes down -- not the target's own importance.
    criticality             TEXT NOT NULL CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What listDependenciesForAsset's own "what does this asset depend on" query uses.
CREATE INDEX IF NOT EXISTS idx_asset_dependencies_dependent ON asset_dependencies(dependent_asset_id);
-- What listDependentsOfAsset's own "what depends on this asset" reverse-lookup uses.
CREATE INDEX IF NOT EXISTS idx_asset_dependencies_target_asset ON asset_dependencies(target_asset_id) WHERE target_type = 'asset';
-- What listDependentsOfVendor's own vendor-outage cascade query uses.
CREATE INDEX IF NOT EXISTS idx_asset_dependencies_target_vendor ON asset_dependencies(organization_id, target_vendor, target_vendor_category) WHERE target_type = 'vendor';

COMMIT;
