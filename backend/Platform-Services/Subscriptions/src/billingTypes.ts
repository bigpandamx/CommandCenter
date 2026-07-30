import type { UpdateChannel } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { Capability } from "./types.js";

/**
 * Billing/subscription domain, migrated in from Aegis's backend
 * (subscription_plans / subscriptions / usage_records / invoices /
 * payment_methods / usage_alerts) per the Command-Center-is-billing-owner
 * decision. See CUTOVER.md at the repo root for the migration plan.
 *
 * Real Stripe integration for subscriptions/invoices now exists (see
 * stripeIntegration.ts, stripeClient.ts) -- this is Phase 1 of the
 * cutover: Command Center can process real payments. Aegis's own
 * Stripe-backed billing (app/integrations/stripe_service.py,
 * app/api/routes/stripe_webhooks.py) is still the live system of record
 * for existing customers; migrating their actual subscriptions/customers
 * off it is a separate, later, carefully-sequenced step, not done here.
 * Payment method vaulting (payment_methods table) is still schema-only.
 *
 * Money is stored as integer cents, not float/decimal, to avoid the
 * rounding-error class of bug that decimal-as-float billing code invites.
 * Aegis's own schema used SQLAlchemy DECIMAL (correct), not float --
 * integer cents here is an equivalent-safety, simpler-arithmetic choice,
 * not a fix for a bug that existed there.
 */

export type BillingCycle = "monthly" | "quarterly" | "annual" | "usage_based";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled" | "expired";

/**
 * A purchasable plan. Replaces the old hardcoded
 * defaultPolicyForTier() switch statement as the source of truth for
 * device caps and channel entitlements -- those are now plan attributes,
 * looked up per-organization via its active Subscription, instead of a
 * fixed 3-tier mapping. defaultPolicyForTier() still exists as the
 * fallback for an organization with no active subscription (see
 * policy.ts) so nothing that depended on it breaks.
 */
export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  billingCycle: BillingCycle;
  basePriceCents: number;
  currency: string;
  monthlyTokenQuota: number | null;
  monthlyRequestQuota: number | null;
  maxDevices: number | null;
  allowedChannels: UpdateChannel[];
  /** Gated features this plan grants -- see Capability's own doc comment (types.ts) for why this started minimal. Defaults to [] (a plan grants no gated capabilities unless explicitly given them), matching the same "start restrictive, expand deliberately" posture as the rest of this file's quota fields. */
  includedCapabilities: Capability[];
  /** The Stripe Price this plan charges against -- null for a plan that's never meant to be sold through Stripe (e.g. "trial", which subscribeOrganizationWithStripe skips Stripe entirely for). Required for any paid plan before subscribeOrganizationWithStripe can subscribe an org to it. */
  stripePriceId?: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Running totals for the current billing period; reset on renewal (see renewSubscriptionPeriod). */
  currentTokensUsed: number;
  currentRequestsUsed: number;
  /** Null for trial subscriptions or anything created before Stripe integration existed -- see subscribeOrganizationWithStripe in stripeIntegration.ts. Optional so the many existing call sites that construct a Subscription without Stripe in mind keep working unchanged. */
  stripeSubscriptionId?: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  subscriptionId: string;
  tokensUsed: number;
  requestCount: number;
  recordedAt: Date;
}

export interface CreatePlanInput {
  code: string;
  name: string;
  billingCycle: BillingCycle;
  basePriceCents: number;
  currency?: string;
  monthlyTokenQuota?: number | null;
  monthlyRequestQuota?: number | null;
  maxDevices?: number | null;
  allowedChannels: UpdateChannel[];
  /** Optional, defaults to [] -- every existing createPlan call site that predates capabilities keeps working unchanged. */
  includedCapabilities?: Capability[];
  /** Optional, defaults to null -- a plan with no Stripe price can still exist locally (e.g. "trial") but can't be passed to subscribeOrganizationWithStripe. */
  stripePriceId?: string | null;
}

export interface RecordUsageInput {
  tokensUsed: number;
  requestCount: number;
}

export type BillingErrorCode =
  | "plan_not_found"
  | "plan_inactive"
  | "duplicate_plan_code"
  | "organization_not_found"
  | "no_active_subscription"
  | "already_subscribed"
  | "plan_missing_stripe_price"
  | "stripe_subscription_customer_mismatch"
  | "token_quota_exceeded"
  | "request_quota_exceeded";

/**
 * Schema exists (see 0004_billing.sql) but there is no domain logic for
 * these yet -- they need a real payment processor (Stripe) integration,
 * which is out of scope for a database-migration session. Do not build
 * fake invoice/payment logic against these types; wire them up when
 * Stripe integration is actually being built.
 */
/**
 * Real Stripe integration now exists for subscriptions (see
 * stripeIntegration.ts) -- invoices are created from
 * invoice.payment_succeeded/failed webhook events, keyed by
 * stripeInvoiceId for idempotency (Stripe delivers webhooks
 * at-least-once). Payment method vaulting is still schema-only; nothing
 * writes to payment_methods yet.
 */
export interface Invoice {
  id: string;
  organizationId: string;
  subscriptionId: string;
  invoiceNumber: string;
  periodStart: Date;
  periodEnd: Date;
  totalCents: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  /** The Stripe invoice this row was created from. Unique -- see getInvoiceByStripeId's idempotency use in handleStripeWebhookEvent. */
  stripeInvoiceId?: string | null;
  createdAt: Date;
}

export interface PaymentMethod {
  id: string;
  organizationId: string;
  provider: "stripe";
  externalId: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface UsageAlert {
  id: string;
  organizationId: string;
  subscriptionId: string;
  alertType: "token_quota_warning" | "request_quota_warning" | "quota_exceeded";
  thresholdRatio: number;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
}
