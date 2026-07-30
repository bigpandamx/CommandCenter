/**
 * Port for the Stripe operations Command Center's billing domain actually
 * needs. Deliberately narrow -- not a wrapper around Stripe's whole API,
 * just what subscribeOrganizationWithStripe/handleStripeWebhookEvent
 * (stripeIntegration.ts) call. Same reasoning as BillingRepository being
 * a port instead of every caller importing `pg` directly: lets domain
 * logic be tested against an in-memory fake (test/fakeStripeClient.ts)
 * instead of needing real Stripe credentials and network access to run
 * a single unit test.
 */

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
}

export type StripeSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface StripeSubscription {
  id: string;
  status: StripeSubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  customerId: string;
}

export interface StripeInvoice {
  id: string;
  subscriptionId: string | null;
  customerId: string;
  totalCents: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible" | null;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * A verified, parsed Stripe webhook event. `data` is intentionally typed
 * as `unknown` at this layer and narrowed by the specific handler in
 * handleStripeWebhookEvent (switching on `type`) -- Stripe's actual event
 * payload shape varies per event type, and re-modeling all of them here
 * would just be re-implementing Stripe's own SDK types badly.
 */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: unknown;
}

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

export interface StripeClient {
  createCustomer(input: { email?: string; name?: string; organizationId: string }): Promise<StripeCustomer>;

  createSubscription(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
  }): Promise<StripeSubscription>;

  cancelSubscription(stripeSubscriptionId: string): Promise<void>;

  /** Used by adoptExistingStripeSubscription to confirm a subscription id from a migration source actually exists in Stripe and get its real current status/period, rather than trusting the source blindly. */
  retrieveSubscription(stripeSubscriptionId: string): Promise<StripeSubscription>;

  /**
   * Verifies the webhook signature and parses the payload. Throws
   * StripeSignatureError on a bad/missing signature -- callers (the
   * webhook route) should map that to an HTTP 400, never process an
   * unverified payload.
   */
  constructWebhookEvent(rawBody: string, signatureHeader: string, webhookSecret: string): StripeWebhookEvent;
}
