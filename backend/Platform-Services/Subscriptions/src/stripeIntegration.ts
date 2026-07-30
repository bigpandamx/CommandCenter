import { randomUUID } from "node:crypto";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { BillingRepository } from "./billingRepository.js";
import type { Invoice, Subscription } from "./billingTypes.js";
import type { StripeClient, StripeInvoice, StripeSubscription } from "./stripeClient.js";
import { BillingError } from "./subscriptionService.js";

/**
 * Ensures this organization has a Stripe customer, creating one if
 * needed. Deliberately does NOT persist the result -- Subscriptions
 * doesn't depend on Organizations' repository port (only on the
 * Organization type, same precedent as billingTypes.ts's existing
 * Desktop-Apps import), so the caller (the route layer, which already
 * has both repos wired) is responsible for calling
 * organizationsRepo.updateStripeCustomerId with the returned id when
 * `organization.stripeCustomerId` was null going in.
 */
export async function ensureStripeCustomer(
  stripeClient: StripeClient,
  organization: Organization,
): Promise<string> {
  if (organization.stripeCustomerId) {
    return organization.stripeCustomerId;
  }
  const customer = await stripeClient.createCustomer({
    name: organization.name,
    organizationId: organization.id,
  });
  return customer.id;
}

export interface SubscribeWithStripeResult {
  subscription: Subscription;
  /** Non-null only when a new Stripe customer was just created for this org -- the caller must persist it via OrganizationsRepository.updateStripeCustomerId. Null when the org already had one, so there's nothing new to save. */
  newStripeCustomerId: string | null;
}

/**
 * Subscribes an organization to a plan through real Stripe, rather than
 * subscribeOrganization's local-only version. Requires the plan to have
 * a stripePriceId -- use plain subscribeOrganization for plans (like
 * "trial") that are never meant to be sold through Stripe at all.
 */
export async function subscribeOrganizationWithStripe(
  repo: BillingRepository,
  stripeClient: StripeClient,
  organization: Organization,
  planCode: string,
  now: Date = new Date(),
): Promise<SubscribeWithStripeResult> {
  const plan = await repo.getPlanByCode(planCode);
  if (!plan) {
    throw new BillingError(`Unknown plan code "${planCode}"`, "plan_not_found");
  }
  if (!plan.isActive) {
    throw new BillingError(`Plan "${planCode}" is no longer available`, "plan_inactive");
  }
  if (!plan.stripePriceId) {
    throw new BillingError(
      `Plan "${planCode}" has no Stripe price configured -- use subscribeOrganization for non-Stripe plans`,
      "plan_missing_stripe_price",
    );
  }

  const existing = await repo.getActiveSubscriptionForOrg(organization.id);
  if (existing) {
    throw new BillingError(
      "Organization already has an active subscription -- use changeSubscriptionPlan instead",
      "already_subscribed",
    );
  }

  const newStripeCustomerId = organization.stripeCustomerId ? null : await ensureStripeCustomer(stripeClient, organization);
  const stripeCustomerId = organization.stripeCustomerId ?? newStripeCustomerId!;

  const stripeSubscription = await stripeClient.createSubscription({
    customerId: stripeCustomerId,
    priceId: plan.stripePriceId,
    organizationId: organization.id,
  });

  const subscription: Subscription = {
    id: randomUUID(),
    organizationId: organization.id,
    planId: plan.id,
    status: mapStripeStatus(stripeSubscription.status),
    currentPeriodStart: stripeSubscription.currentPeriodStart,
    currentPeriodEnd: stripeSubscription.currentPeriodEnd,
    currentTokensUsed: 0,
    currentRequestsUsed: 0,
    stripeSubscriptionId: stripeSubscription.id,
    createdAt: now,
    cancelledAt: null,
  };
  await repo.createSubscription(subscription);

  return { subscription, newStripeCustomerId };
}

export interface AdoptSubscriptionResult {
  subscription: Subscription;
  /** True if the org's stripeCustomerId needed to be recorded (it was null/different going in) -- caller must persist via OrganizationsRepository.updateStripeCustomerId. Same pattern as SubscribeWithStripeResult.newStripeCustomerId, just named for what adoption actually does (record, not create). */
  organizationStripeCustomerIdChanged: boolean;
}

/**
 * Migration primitive: records an already-existing Stripe subscription
 * (created elsewhere -- e.g. by Aegis's own, currently-live Stripe
 * integration) into Command Center's local tables, WITHOUT calling any
 * Stripe mutation API. This is deliberately the only supported way to
 * bring a pre-existing customer's billing into Command Center -- it can
 * never create a duplicate Stripe subscription or double-charge anyone,
 * because it never calls stripe.subscriptions.create at all.
 *
 * Verifies the given ids against Stripe's own retrieveSubscription rather
 * than trusting the migration source's assumed status/period -- a stale
 * or wrong export shouldn't get written into Command Center's database
 * as if it were current truth.
 *
 * Idempotent: calling this again with the same stripeSubscriptionId for
 * an org that already has it recorded as its active subscription is a
 * no-op that returns the existing row. Calling it for an org that
 * already has a DIFFERENT active subscription is an error -- silently
 * overwriting which subscription is "the" active one for an org is
 * exactly the kind of billing bug that must fail loud, not get papered
 * over.
 */
export async function adoptExistingStripeSubscription(
  repo: BillingRepository,
  stripeClient: StripeClient,
  organization: Organization,
  planCode: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  now: Date = new Date(),
): Promise<AdoptSubscriptionResult> {
  const plan = await repo.getPlanByCode(planCode);
  if (!plan) {
    throw new BillingError(`Unknown plan code "${planCode}"`, "plan_not_found");
  }

  const existing = await repo.getActiveSubscriptionForOrg(organization.id);
  if (existing) {
    if (existing.stripeSubscriptionId === stripeSubscriptionId) {
      // Already adopted -- safe to re-run this migration for the same org.
      return {
        subscription: existing,
        organizationStripeCustomerIdChanged: organization.stripeCustomerId !== stripeCustomerId,
      };
    }
    throw new BillingError(
      `Organization ${organization.id} already has a different active subscription (${existing.id}) -- ` +
        `refusing to silently replace it with ${stripeSubscriptionId}. Cancel or reconcile the existing one first.`,
      "already_subscribed",
    );
  }

  // Verify against Stripe's own record rather than trusting the migration
  // source's assumed status/period.
  const stripeSubscription = await stripeClient.retrieveSubscription(stripeSubscriptionId);
  if (stripeSubscription.customerId !== stripeCustomerId) {
    throw new BillingError(
      `Stripe subscription ${stripeSubscriptionId} belongs to customer ${stripeSubscription.customerId}, ` +
        `not the given ${stripeCustomerId} -- refusing to adopt with mismatched customer/subscription ids.`,
      "stripe_subscription_customer_mismatch",
    );
  }

  const subscription: Subscription = {
    id: randomUUID(),
    organizationId: organization.id,
    planId: plan.id,
    status: mapStripeStatus(stripeSubscription.status),
    currentPeriodStart: stripeSubscription.currentPeriodStart,
    currentPeriodEnd: stripeSubscription.currentPeriodEnd,
    // Deliberately NOT carried over from Aegis's usage counters -- those
    // reset on Command Center's own billing period boundaries going
    // forward, not mid-migration. A org mid-period at cutover starts a
    // fresh count here; this is a one-time, disclosed simplification of
    // the migration, not silent data loss (Aegis's own usage_records
    // history isn't deleted by this, only not carried into the new
    // period's running total).
    currentTokensUsed: 0,
    currentRequestsUsed: 0,
    stripeSubscriptionId,
    createdAt: now,
    cancelledAt: null,
  };
  await repo.createSubscription(subscription);

  return {
    subscription,
    organizationStripeCustomerIdChanged: organization.stripeCustomerId !== stripeCustomerId,
  };
}

export async function cancelSubscriptionWithStripe(
  repo: BillingRepository,
  stripeClient: StripeClient,
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const current = await repo.getActiveSubscriptionForOrg(organizationId);
  if (!current) {
    throw new BillingError("Organization has no active subscription to cancel", "no_active_subscription");
  }
  if (current.stripeSubscriptionId) {
    await stripeClient.cancelSubscription(current.stripeSubscriptionId);
  }
  await repo.updateSubscription({ ...current, status: "cancelled", cancelledAt: now });
}

function mapStripeStatus(status: string): Subscription["status"] {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "unpaid":
      return "suspended";
    case "paused":
      // Stripe's own "subscription paused" state (e.g. a trial that
      // ended with no payment method and pause_collection configured
      // instead of canceling outright) -- suspended is the closest
      // local equivalent, same as unpaid: access blocked, not
      // cancelled outright.
      return "suspended";
    case "incomplete":
    case "incomplete_expired":
      // Stripe's "the customer never completed initial payment" states --
      // closest local equivalent is past_due (payment problem), not
      // active. There's no "incomplete" in our own SubscriptionStatus;
      // collapsing here rather than adding a status nothing else handles.
      return "past_due";
    default:
      // Reachable now that stripeGateway.ts's mapSubscription casts
      // rather than relying on exact type compatibility with Stripe's
      // own SDK type (see that cast's own comment) -- a genuinely
      // unrecognized status should never silently look like "active" or
      // crash the whole request. Suspended is the same safe default
      // used for unpaid/paused: block access until a human looks,
      // rather than guess.
      // eslint-disable-next-line no-console
      console.warn(`Unrecognized Stripe subscription status "${status}" -- mapping to suspended pending review`);
      return "suspended";
  }
}

/**
 * Dispatches a verified Stripe webhook event to the right local update.
 * Idempotent for invoice events (checks getInvoiceByStripeId first) --
 * Stripe delivers webhooks at-least-once, so the same event can arrive
 * more than once. Subscription-update events are naturally idempotent
 * already (updateSubscription is a full overwrite, not an increment).
 *
 * Unrecognized event types are silently ignored, not errors -- Stripe
 * sends many event types we don't care about (e.g. customer.updated),
 * and a webhook endpoint that 400s on those would make Stripe retry
 * them forever for no reason.
 */
export async function handleStripeWebhookEvent(
  repo: BillingRepository,
  event: { id: string; type: string; data: unknown },
): Promise<void> {
  switch (event.type) {
    case "customer.subscription.updated": {
      const stripeSub = event.data as StripeSubscription;
      const local = await repo.getSubscriptionByStripeId(stripeSub.id);
      if (!local) return; // Not one of ours (or not synced yet) -- nothing to update.
      await repo.updateSubscription({
        ...local,
        status: mapStripeStatus(stripeSub.status),
        currentPeriodStart: stripeSub.currentPeriodStart,
        currentPeriodEnd: stripeSub.currentPeriodEnd,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data as StripeSubscription;
      const local = await repo.getSubscriptionByStripeId(stripeSub.id);
      if (!local) return;
      await repo.updateSubscription({ ...local, status: "cancelled", cancelledAt: new Date() });
      return;
    }

    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const stripeInvoice = event.data as StripeInvoice;

      const alreadyProcessed = await repo.getInvoiceByStripeId(stripeInvoice.id);
      if (alreadyProcessed) return; // Idempotent -- Stripe redelivers webhooks.

      let subscriptionId: string | null = null;
      if (stripeInvoice.subscriptionId) {
        const local = await repo.getSubscriptionByStripeId(stripeInvoice.subscriptionId);
        subscriptionId = local?.id ?? null;

        if (local && event.type === "invoice.payment_failed" && local.status !== "cancelled") {
          await repo.updateSubscription({ ...local, status: "past_due" });
        }
      }

      if (!subscriptionId) return; // Invoice for a subscription we don't track locally -- nothing to record.

      const invoice: Invoice = {
        id: randomUUID(),
        organizationId: (await repo.getSubscriptionById(subscriptionId))!.organizationId,
        subscriptionId,
        invoiceNumber: stripeInvoice.id,
        periodStart: stripeInvoice.periodStart,
        periodEnd: stripeInvoice.periodEnd,
        totalCents: stripeInvoice.totalCents,
        currency: stripeInvoice.currency,
        status: event.type === "invoice.payment_succeeded" ? "paid" : "open",
        stripeInvoiceId: stripeInvoice.id,
        createdAt: new Date(),
      };
      await repo.createInvoice(invoice);
      return;
    }

    default:
      return; // Unrecognized/uninteresting event type -- not an error.
  }
}
