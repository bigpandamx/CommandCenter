import type { BillingRepository } from "../src/billingRepository.js";
import type { Invoice, Subscription, SubscriptionPlan, UsageRecord } from "../src/billingTypes.js";

export class FakeBillingRepository implements BillingRepository {
  plans = new Map<string, SubscriptionPlan>();
  plansByCode = new Map<string, string>(); // code -> id
  subscriptions = new Map<string, Subscription>();
  usageRecords: UsageRecord[] = [];
  invoices = new Map<string, Invoice>();

  async createPlan(plan: SubscriptionPlan) {
    this.plans.set(plan.id, plan);
    this.plansByCode.set(plan.code, plan.id);
  }

  async getPlanById(planId: string) {
    return this.plans.get(planId) ?? null;
  }

  async getPlanByCode(code: string) {
    const id = this.plansByCode.get(code);
    return id ? this.plans.get(id) ?? null : null;
  }

  async listPlans(opts?: { activeOnly?: boolean }) {
    const all = [...this.plans.values()];
    return opts?.activeOnly ? all.filter((p) => p.isActive) : all;
  }

  async createSubscription(subscription: Subscription) {
    this.subscriptions.set(subscription.id, subscription);
  }

  async getSubscriptionById(subscriptionId: string) {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  async getActiveSubscriptionForOrg(organizationId: string) {
    const active = [...this.subscriptions.values()].find(
      (s) =>
        s.organizationId === organizationId &&
        (s.status === "active" || s.status === "trialing" || s.status === "past_due"),
    );
    return active ?? null;
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string) {
    const found = [...this.subscriptions.values()].find((s) => s.stripeSubscriptionId === stripeSubscriptionId);
    return found ?? null;
  }

  async updateSubscription(subscription: Subscription) {
    this.subscriptions.set(subscription.id, subscription);
  }

  async appendUsageRecord(record: UsageRecord) {
    this.usageRecords.push(record);
  }

  async listUsageRecordsForSubscription(subscriptionId: string, opts?: { since?: Date }) {
    let records = this.usageRecords.filter((r) => r.subscriptionId === subscriptionId);
    if (opts?.since) {
      const since = opts.since;
      records = records.filter((r) => r.recordedAt.getTime() >= since.getTime());
    }
    return records;
  }

  async createInvoice(invoice: Invoice) {
    this.invoices.set(invoice.id, invoice);
  }

  async getInvoiceByStripeId(stripeInvoiceId: string) {
    const found = [...this.invoices.values()].find((i) => i.stripeInvoiceId === stripeInvoiceId);
    return found ?? null;
  }
}
