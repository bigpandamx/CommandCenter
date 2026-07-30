-- 0021_stripe_integration.sql
-- Adds the columns needed for real Stripe integration (Phase 1 of the
-- Command-Center-is-billing-owner cutover -- see CUTOVER.md). Previous
-- billing migration (0004) deliberately left invoices/payment_methods as
-- schema-only with no business logic; this migration is what makes that
-- logic possible to build honestly, by giving local rows something to
-- reconcile against the actual Stripe objects they represent.
--
-- Nullable throughout: an organization/subscription/invoice can exist
-- before it has a corresponding Stripe object (e.g. a trialing
-- subscription with no payment method yet never needs a Stripe
-- subscription at all).

BEGIN;

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

ALTER TABLE subscription_plans
    ADD COLUMN IF NOT EXISTS stripe_price_id TEXT UNIQUE;

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT UNIQUE;

-- Webhook events are processed at-least-once by design (Stripe itself
-- retries on non-2xx and callers may also redeliver) -- this table is
-- what makes handleStripeWebhookEvent's idempotency check a real
-- guarantee rather than a best-effort in-memory one that resets on
-- every process restart.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    stripe_event_id   TEXT PRIMARY KEY,
    event_type        TEXT NOT NULL,
    processed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
