import type { Invoice, Subscription, SubscriptionPlan, UsageRecord } from "./billingTypes.js";

export interface BillingRepository {
  createPlan(plan: SubscriptionPlan): Promise<void>;
  getPlanById(planId: string): Promise<SubscriptionPlan | null>;
  getPlanByCode(code: string): Promise<SubscriptionPlan | null>;
  listPlans(opts?: { activeOnly?: boolean }): Promise<SubscriptionPlan[]>;

  createSubscription(subscription: Subscription): Promise<void>;
  getSubscriptionById(subscriptionId: string): Promise<Subscription | null>;
  /** At most one subscription should be "active"/"trialing"/"past_due" per org at a time -- callers enforce this, the repository just stores what it's given. */
  getActiveSubscriptionForOrg(organizationId: string): Promise<Subscription | null>;
  /** Used to dispatch Stripe webhook events (customer.subscription.*) back to the right local row -- Stripe's payload identifies the subscription by its own id, not ours. */
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null>;
  updateSubscription(subscription: Subscription): Promise<void>;

  appendUsageRecord(record: UsageRecord): Promise<void>;
  listUsageRecordsForSubscription(
    subscriptionId: string,
    opts?: { since?: Date },
  ): Promise<UsageRecord[]>;

  createInvoice(invoice: Invoice): Promise<void>;
  /** Idempotency check for invoice.payment_succeeded/failed webhooks, which Stripe delivers at-least-once. */
  getInvoiceByStripeId(stripeInvoiceId: string): Promise<Invoice | null>;
}
