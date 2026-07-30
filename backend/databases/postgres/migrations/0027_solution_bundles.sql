-- 0027_solution_bundles.sql
-- Solution Bundles: curated, typically industry-specific groups of
-- services sold as one purchasable unit (Agriculture, Manufacturing,
-- Healthcare, ...) instead of forcing a customer to assemble the same
-- capability set one add-on at a time, or forcing the catalog to grow
-- a dedicated subscription tier per industry.
--
-- Deliberately simpler than the per-service tier matrix -- one
-- minimum_plan_code, one price, no per-tier variation. Bundles are
-- meant to be a small, curated, easy-to-reason-about purchasing unit;
-- if a bundle ever needs per-tier pricing complexity, that's a strong
-- signal it should be several services in the regular catalog instead.
--
-- Bundle membership is resolved dynamically at read time (see
-- computeServiceAvailability/computeFinalEntitlements), not snapshotted
-- at purchase time -- if an admin later adds a new service to the
-- Agriculture bundle, every existing subscriber gets it automatically,
-- the same way a tier's included-services list works.

BEGIN;

CREATE TABLE IF NOT EXISTS solution_bundles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                 TEXT NOT NULL UNIQUE,  -- e.g. "agriculture-bundle"
    name                TEXT NOT NULL,
    description         TEXT NOT NULL,
    category            TEXT NOT NULL,  -- typically an industry: "agriculture", "manufacturing", "healthcare"
    is_active           BOOLEAN NOT NULL DEFAULT true,
    minimum_plan_code   TEXT REFERENCES subscription_plans(code),
    monthly_price_cents INTEGER,
    stripe_price_id     TEXT,
    supports_trial      BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bundle_services (
    bundle_id   UUID NOT NULL REFERENCES solution_bundles(id) ON DELETE CASCADE,
    service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (bundle_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_services_service ON bundle_services(service_id);

-- One row per (org, bundle), same shape as org_service_selections --
-- cancelling and re-attaching updates the same row rather than
-- creating history rows.
CREATE TABLE IF NOT EXISTS org_bundle_selections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    bundle_id         UUID NOT NULL REFERENCES solution_bundles(id) ON DELETE CASCADE,
    status            TEXT NOT NULL CHECK (status IN ('active', 'trial', 'cancelled')),
    trial_expires_at  TIMESTAMPTZ,
    attached_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at      TIMESTAMPTZ,
    UNIQUE (organization_id, bundle_id)
);

CREATE INDEX IF NOT EXISTS idx_org_bundle_selections_org ON org_bundle_selections(organization_id);

COMMIT;
