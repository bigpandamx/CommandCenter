-- 0024_service_catalog.sql
-- Product/service catalog: the data model behind "attach an add-on to
-- an existing subscription instead of inventing a new tier." Three
-- tables, deliberately keyed off subscription_plans.code (the existing
-- tier/plan concept from 0004_billing.sql) rather than a new parallel
-- "tiers" table -- a tier IS a subscription plan, not a separate thing.
--
-- The whole point of this catalog: adding a new service, or changing
-- which tier it's included/addable/unavailable at, is a DATA change in
-- these tables, never a code change. See Platform-Services/ServiceCatalog's
-- own module doc comment for the full state-computation logic this
-- schema feeds.

BEGIN;

CREATE TABLE IF NOT EXISTS services (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key           TEXT NOT NULL UNIQUE,  -- stable identifier code references by, e.g. "developer-sandbox"
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    category      TEXT NOT NULL,  -- free text ("ai", "compliance", "automation", "infrastructure", "identity", ...) -- not an enum, since new categories shouldn't need a migration
    is_active     BOOLEAN NOT NULL DEFAULT true,  -- catalog-wide retirement switch, distinct from a per-org/global disable override below -- an inactive service shouldn't appear in the catalog at all, vs. a disabled one that's temporarily unavailable but still listed
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The tier matrix: for (service, plan), is it included, addable, or
-- unavailable. A service with no row for a given plan_code is treated
-- as "unavailable" at that tier by default -- see the service module's
-- resolveTierAvailability for that fallback, so a brand-new service
-- doesn't need a row inserted for every existing plan just to be
-- correctly "not yet offered" everywhere.
CREATE TABLE IF NOT EXISTS service_tier_availability (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id        UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    plan_code         TEXT NOT NULL REFERENCES subscription_plans(code) ON DELETE CASCADE,
    availability_type TEXT NOT NULL CHECK (availability_type IN ('included', 'addable', 'unavailable')),
    -- Only meaningful when availability_type = 'addable' -- the Stripe
    -- price this specific (service, tier) combination bills against.
    -- Nullable: an addable service might not have its own price yet
    -- (not launched for billing), or might be free.
    add_on_stripe_price_id TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service_id, plan_code)
);

-- An org's actual attached add-ons. One row per (org, service) --
-- cancelling and re-attaching updates the same row rather than creating
-- new history rows; attached_at/cancelled_at is the (partial) audit
-- trail, not a full event log. If a full history ever becomes
-- necessary, that's an additive events table alongside this one, not a
-- redesign of it.
CREATE TABLE IF NOT EXISTS org_service_selections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id        UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status            TEXT NOT NULL CHECK (status IN ('active', 'trial', 'cancelled')),
    trial_expires_at  TIMESTAMPTZ,  -- only meaningful when status = 'trial'
    attached_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at      TIMESTAMPTZ,
    UNIQUE (organization_id, service_id)
);

-- Admin/operational overrides, independent of the subscription/tier
-- model entirely -- a service can be temporarily unavailable
-- (maintenance, policy, admin action) regardless of what tier grants
-- it. organization_id NULL means a global override (affects every
-- org); non-null means it's scoped to one org (e.g. a policy action
-- against a specific customer). resolved_at NULL means still active --
-- overrides are resolved by setting this, not by deleting the row, so
-- there's a record of what was disabled and for how long.
CREATE TABLE IF NOT EXISTS service_disable_overrides (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id            UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global
    reason                TEXT NOT NULL,
    cause                 TEXT NOT NULL CHECK (cause IN ('maintenance', 'policy', 'admin_action')),
    estimated_resolution  TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            TEXT,  -- staff user id, informational -- not a hard FK, staff_users predates this migration's design constraints on identity references
    resolved_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_tier_availability_service ON service_tier_availability(service_id);
CREATE INDEX IF NOT EXISTS idx_org_service_selections_org ON org_service_selections(organization_id);
CREATE INDEX IF NOT EXISTS idx_service_disable_overrides_service ON service_disable_overrides(service_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_disable_overrides_org ON service_disable_overrides(organization_id) WHERE resolved_at IS NULL;

COMMIT;
