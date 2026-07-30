import { randomUUID } from "node:crypto";
import type {
  StripeClient,
  StripeCustomer,
  StripeInvoice,
  StripeSubscription,
  StripeWebhookEvent,
} from "../src/stripeClient.js";
import { StripeSignatureError } from "../src/stripeClient.js";

/**
 * In-memory fake for StripeClient. `nextWebhookEvent` lets a test queue
 * up exactly what constructWebhookEvent should return next, so tests can
 * exercise handleStripeWebhookEvent without needing a real signed
 * payload -- same "the fake lets you dictate the scenario directly"
 * philosophy as FakeBillingRepository being a plain Map instead of a
 * database.
 */
export class FakeStripeClient implements StripeClient {
  customers = new Map<string, StripeCustomer>();
  subscriptions = new Map<string, StripeSubscription>();
  cancelledSubscriptionIds = new Set<string>();

  /** Set by a test before calling code that triggers constructWebhookEvent; consumed (cleared) on read. */
  private queuedWebhookEvent: StripeWebhookEvent | StripeSignatureError | null = null;

  queueWebhookEvent(event: StripeWebhookEvent) {
    this.queuedWebhookEvent = event;
  }

  queueWebhookSignatureFailure() {
    this.queuedWebhookEvent = new StripeSignatureError("Invalid signature (fake)");
  }

  async createCustomer(input: { email?: string; name?: string; organizationId: string }): Promise<StripeCustomer> {
    const customer: StripeCustomer = { id: `cus_${randomUUID()}`, email: input.email ?? null, name: input.name ?? null };
    this.customers.set(customer.id, customer);
    return customer;
  }

  async createSubscription(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
  }): Promise<StripeSubscription> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    const subscription: StripeSubscription = {
      id: `sub_${randomUUID()}`,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      customerId: input.customerId,
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    this.cancelledSubscriptionIds.add(stripeSubscriptionId);
    const sub = this.subscriptions.get(stripeSubscriptionId);
    if (sub) this.subscriptions.set(stripeSubscriptionId, { ...sub, status: "canceled" });
  }

  async retrieveSubscription(stripeSubscriptionId: string): Promise<StripeSubscription> {
    const sub = this.subscriptions.get(stripeSubscriptionId);
    if (!sub) {
      throw new Error(`FakeStripeClient: no such subscription ${stripeSubscriptionId} -- did you call seedExistingSubscription?`);
    }
    return sub;
  }

  /** Simulates a subscription that already exists in Stripe (e.g. one Aegis created directly) without going through createSubscription -- for adoption tests. */
  seedExistingSubscription(subscription: StripeSubscription): void {
    this.subscriptions.set(subscription.id, subscription);
  }

  constructWebhookEvent(_rawBody: string, _signatureHeader: string, _webhookSecret: string): StripeWebhookEvent {
    if (this.queuedWebhookEvent === null) {
      throw new Error("FakeStripeClient.constructWebhookEvent called with no event queued -- call queueWebhookEvent first");
    }
    const result = this.queuedWebhookEvent;
    this.queuedWebhookEvent = null;
    if (result instanceof StripeSignatureError) {
      throw result;
    }
    return result;
  }
}

export function fakeStripeInvoice(overrides: Partial<StripeInvoice> = {}): StripeInvoice {
  return {
    id: `in_${randomUUID()}`,
    subscriptionId: null,
    customerId: `cus_${randomUUID()}`,
    totalCents: 2900,
    currency: "usd",
    status: "paid",
    periodStart: new Date(),
    periodEnd: new Date(),
    ...overrides,
  };
}
