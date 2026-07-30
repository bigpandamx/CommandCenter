/**
 * Real Stripe implementation of Platform-Services/Subscriptions's
 * StripeClient port. Same offline caveat as every other real-external-API
 * adapter in this repo (the *.pg.ts files): type-checked against the
 * `stripe` SDK's documented API (see types/node-shims.d.ts's ambient
 * shim), not executed against a live Stripe account in this session --
 * no network access here, and even with it, this specifically should not
 * be exercised against real Stripe without a test-mode API key.
 */
import Stripe from "stripe";
import type {
  StripeClient,
  StripeCustomer,
  StripeInvoice,
  StripeSubscription,
  StripeSubscriptionStatus,
  StripeWebhookEvent,
} from "../../Subscriptions/src/stripeClient.js";
import { StripeSignatureError } from "../../Subscriptions/src/stripeClient.js";

export class StripeGateway implements StripeClient {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
  }

  async createCustomer(input: { email?: string; name?: string; organizationId: string }): Promise<StripeCustomer> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      name: input.name,
      metadata: { organizationId: input.organizationId },
    });
    // Stripe's real types are `string | null | undefined` here (a field
    // can be entirely absent from the API response, not just null) --
    // our own StripeCustomer type is deliberately `string | null` only,
    // so undefined collapses to null rather than leaking a third state
    // callers would need to handle for no real benefit.
    return { id: customer.id, email: customer.email ?? null, name: customer.name ?? null };
  }

  async createSubscription(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
  }): Promise<StripeSubscription> {
    const subscription = await this.stripe.subscriptions.create({
      customer: input.customerId,
      items: [{ price: input.priceId }],
      metadata: { organizationId: input.organizationId },
    });
    return mapSubscription(subscription);
  }

  async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(stripeSubscriptionId);
  }

  async retrieveSubscription(stripeSubscriptionId: string): Promise<StripeSubscription> {
    const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    return mapSubscription(subscription);
  }

  constructWebhookEvent(rawBody: string, signatureHeader: string, webhookSecret: string): StripeWebhookEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    } catch (err) {
      throw new StripeSignatureError(err instanceof Error ? err.message : "Invalid Stripe webhook signature");
    }

    return {
      id: event.id,
      type: event.type,
      data: mapEventData(event),
    };
  }
}

/**
 * Stripe's own types for `subscription.customer`, `invoice.customer`,
 * and `invoice.subscription` are all `string | <the expanded object> |
 * <possibly null>` -- the SDK's types account for the `expand` API
 * parameter always being possible, even though this codebase never
 * requests expansion and these are always plain string IDs at runtime.
 * Extracts the ID either way rather than assuming the un-expanded shape
 * and letting a real (if currently theoretical) expansion silently
 * produce the wrong value.
 */
function extractId(value: string | { id: string } | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : value.id;
}

function mapSubscription(sub: Stripe.Subscription): StripeSubscription {
  const customerId = extractId(sub.customer);
  if (customerId === null) {
    // Shouldn't happen -- Stripe subscriptions always belong to a
    // customer -- but the SDK's own type allows it via expansion
    // edge cases, so fail loud rather than silently produce a
    // StripeSubscription with a customerId that isn't really optional
    // in our own domain model.
    throw new Error(`Stripe subscription ${sub.id} has no resolvable customer id`);
  }
  return {
    id: sub.id,
    // Cast, not a direct assignment -- Stripe's own SDK type for this
    // field may legitimately include values beyond what
    // StripeSubscriptionStatus enumerates (this specific mismatch
    // already happened once with "paused"; the SDK's real type for the
    // installed version is not something that can be verified without
    // real npm registry access, which this sandbox doesn't have).
    // mapStripeStatus (Subscriptions/src/stripeIntegration.ts) is the
    // actual safety net for an unrecognized value reaching this code at
    // runtime -- see its own fallback case.
    status: sub.status as StripeSubscriptionStatus,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    customerId,
  };
}

function mapInvoice(inv: Stripe.Invoice): StripeInvoice {
  const customerId = extractId(inv.customer);
  if (customerId === null) {
    // Same reasoning as mapSubscription -- an invoice with no
    // resolvable customer isn't something our own domain model
    // (StripeInvoice.customerId: string, not optional) can represent,
    // and silently substituting a placeholder would be worse than
    // failing loudly here.
    throw new Error(`Stripe invoice ${inv.id} has no resolvable customer id`);
  }
  return {
    id: inv.id,
    subscriptionId: extractId(inv.subscription),
    customerId,
    totalCents: inv.total,
    currency: inv.currency,
    status: inv.status,
    periodStart: new Date(inv.period_start * 1000),
    periodEnd: new Date(inv.period_end * 1000),
  };
}

/**
 * Narrows event.data.object based on event.type into the shape
 * handleStripeWebhookEvent (Subscriptions/src/stripeIntegration.ts)
 * actually expects for that event type -- keeping that mapping here,
 * next to where Stripe's raw types are already in scope, rather than
 * making the domain layer know about Stripe.Subscription/Stripe.Invoice
 * at all.
 */
function mapEventData(event: Stripe.Event): unknown {
  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return mapSubscription(event.data.object as Stripe.Subscription);
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      return mapInvoice(event.data.object as Stripe.Invoice);
    default:
      return event.data.object;
  }
}
