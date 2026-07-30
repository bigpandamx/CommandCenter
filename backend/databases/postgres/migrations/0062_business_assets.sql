-- 0062_business_assets.sql
-- Business Assets: what an organization actually has that can be at
-- risk -- "Customer Database," "Production API," "Payment Processing
-- System." Deliberately org-scoped, not a shared platform catalog the
-- way risk_knowledge_entries is -- see
-- Risk-Intelligence/src/types.ts's own doc comment on BusinessAsset
-- for the full reasoning, including why this table carries no
-- relationship to a vendor, risk factor, or another asset yet
-- (Dependencies, real, separate future work, not attempted here).

BEGIN;

CREATE TABLE IF NOT EXISTS business_assets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL,
    category         TEXT NOT NULL,
    criticality      TEXT NOT NULL CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
    -- Decommissioned assets are deactivated, not deleted -- a past
    -- risk assessment or treatment that referenced this asset should
    -- still resolve to something real.
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_assets_organization ON business_assets(organization_id, name);

COMMIT;
