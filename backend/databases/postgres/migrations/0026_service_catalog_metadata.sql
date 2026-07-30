-- 0026_service_catalog_metadata.sql
-- App-Store-style catalog metadata: the fields that let the
-- Subscription/Billing system and the Entitlement Engine both defer to
-- the catalog instead of knowing anything about individual services.
--
-- entitlement_key is the actual bridge: the string key a backend
-- `hasEntitlement(org, key)`-style check looks for. This is what lets
-- the catalog subsume the old, much simpler Capability system
-- eventually (see SERVICE_CATALOG.md's own note on why that swap is a
-- deliberately separate, later decision, not bundled into this
-- migration).
--
-- service_dependencies is a real graph, not a list -- a service can
-- depend on another service (Threat Intelligence requires Aegis Core),
-- and computeFinalEntitlements resolves this transitively. See that
-- function's own doc comment for cycle-safety.

BEGIN;

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS is_add_on_eligible   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS supports_trial        BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS monthly_price_cents    INTEGER,
    ADD COLUMN IF NOT EXISTS usage_meter_key         TEXT,
    ADD COLUMN IF NOT EXISTS entitlement_key          TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS feature_flag_key          TEXT;

CREATE TABLE IF NOT EXISTS service_dependencies (
    service_id             UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    depends_on_service_id   UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, depends_on_service_id),
    CHECK (service_id != depends_on_service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_dependencies_depends_on ON service_dependencies(depends_on_service_id);

COMMIT;
