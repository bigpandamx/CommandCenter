-- 0025_service_minimum_tier.sql
-- Adds a minimum-tier eligibility shortcut to services: instead of an
-- admin populating an explicit service_tier_availability row for every
-- plan a service should be purchasable at, a service can declare
-- minimum_plan_code once and the system derives "addable" for every
-- plan at or above it by tier rank (subscription_plans.base_price_cents
-- ordering), and "unavailable" (upgrade path pointing directly at
-- minimum_plan_code) below it.
--
-- Deliberately all-or-nothing per service, not a per-tier fallback: if
-- a service has ANY row in service_tier_availability, minimum_plan_code
-- is ignored entirely for that service and the explicit matrix is the
-- only source of truth. See ServiceCatalog's resolveEffectiveTierAvailability
-- for the actual precedence logic this schema supports.

BEGIN;

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS minimum_plan_code TEXT REFERENCES subscription_plans(code),
    ADD COLUMN IF NOT EXISTS default_add_on_stripe_price_id TEXT;

COMMIT;
