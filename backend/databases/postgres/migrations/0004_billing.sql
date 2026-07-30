-- 0004_billing.sql
-- Billing/subscription schema, migrated in from Aegis's backend
-- (subscription_plans / subscriptions / usage_records / invoices /
-- payment_methods / usage_alerts) per the decision to make Command
-- Center the owner of billing, and Command Center the source of truth
-- for organization identity (see CUTOVER.md at the repo root).
--
-- subscription_plans is NOT org-scoped -- it's a shared catalog, same
-- pattern as update_manifests in 0001. Everything else here follows the
-- standard organization_id-scoped convention.

BEGIN;

CREATE TABLE IF NOT EXISTS subscription_plans (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                  TEXT NOT NULL UNIQUE,
    name                  TEXT NOT NULL,
    billing_cycle         TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual', 'usage_based')),
    base_price_cents      INTEGER NOT NULL,
    currency              TEXT NOT NULL DEFAULT 'usd',
    monthly_token_quota   BIGINT,
    monthly_request_quota BIGINT,
    max_devices           INTEGER,
    allowed_channels      TEXT[] NOT NULL,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id                UUID NOT NULL REFERENCES subscription_plans(id),
    status                 TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired')),
    current_period_start   TIMESTAMPTZ NOT NULL,
    current_period_end     TIMESTAMPTZ NOT NULL,
    current_tokens_used    BIGINT NOT NULL DEFAULT 0,
    current_requests_used  BIGINT NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
-- At most one non-terminal subscription per org, enforced at the DB level
-- rather than only in application code (subscribeOrganization already
-- checks this, but a unique partial index makes it a guarantee, not just
-- a convention -- catches races and any future caller that bypasses the
-- service layer).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_org
    ON subscriptions(organization_id)
    WHERE status IN ('trialing', 'active', 'past_due');

CREATE TABLE IF NOT EXISTS usage_records (
    id                UUID PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    tokens_used       BIGINT NOT NULL,
    request_count     INTEGER NOT NULL,
    recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_records_subscription ON usage_records(subscription_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_org ON usage_records(organization_id);

-- Schema-only below this line -- no application logic exists yet for
-- these three tables. They need real Stripe (or equivalent) payment
-- processor integration to be honest about invoice generation and
-- payment method vaulting, which is out of scope for this migration
-- session. See CUTOVER.md and Control-Plane/Licensing/src/billingTypes.ts
-- for what's deliberately not built.

CREATE TABLE IF NOT EXISTS invoices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id   UUID NOT NULL REFERENCES subscriptions(id),
    invoice_number    TEXT NOT NULL UNIQUE,
    period_start      TIMESTAMPTZ NOT NULL,
    period_end        TIMESTAMPTZ NOT NULL,
    total_cents       INTEGER NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'usd',
    status            TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);

CREATE TABLE IF NOT EXISTS payment_methods (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL CHECK (provider IN ('stripe')),
    external_id       TEXT NOT NULL,
    is_default        BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON payment_methods(organization_id);

CREATE TABLE IF NOT EXISTS usage_alerts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    alert_type        TEXT NOT NULL CHECK (alert_type IN ('token_quota_warning', 'request_quota_warning', 'quota_exceeded')),
    threshold_ratio   REAL NOT NULL,
    triggered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_org ON usage_alerts(organization_id);

COMMIT;
