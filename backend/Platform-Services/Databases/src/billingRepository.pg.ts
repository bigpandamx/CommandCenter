/**
 * Postgres implementation of Platform-Services/Subscriptions's BillingRepository
 * port. Same offline caveat as the other *.pg.ts files in this folder:
 * type-checked against pg's documented API, not executed against a live
 * database in this session.
 */
import type { Pool } from "pg";
import type { BillingRepository } from "../../Subscriptions/src/billingRepository.js";
import type {
  Invoice,
  Subscription,
  SubscriptionPlan,
  UsageRecord,
} from "../../Subscriptions/src/billingTypes.js";

export class PgBillingRepository implements BillingRepository {
  constructor(private readonly pool: Pool) {}

  async createPlan(plan: SubscriptionPlan): Promise<void> {
    await this.pool.query(
      `INSERT INTO subscription_plans
         (id, code, name, billing_cycle, base_price_cents, currency,
          monthly_token_quota, monthly_request_quota, max_devices, allowed_channels,
          included_capabilities, stripe_price_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        plan.id,
        plan.code,
        plan.name,
        plan.billingCycle,
        plan.basePriceCents,
        plan.currency,
        plan.monthlyTokenQuota,
        plan.monthlyRequestQuota,
        plan.maxDevices,
        plan.allowedChannels,
        JSON.stringify(plan.includedCapabilities),
        plan.stripePriceId ?? null,
        plan.isActive,
        plan.createdAt,
      ],
    );
  }

  async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM subscription_plans WHERE id = $1`,
      [planId],
    );
    return rows[0] ? mapPlan(rows[0]) : null;
  }

  async getPlanByCode(code: string): Promise<SubscriptionPlan | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM subscription_plans WHERE code = $1`,
      [code],
    );
    return rows[0] ? mapPlan(rows[0]) : null;
  }

  async listPlans(opts?: { activeOnly?: boolean }): Promise<SubscriptionPlan[]> {
    const { rows } = opts?.activeOnly
      ? await this.pool.query(`SELECT * FROM subscription_plans WHERE is_active = true ORDER BY created_at`)
      : await this.pool.query(`SELECT * FROM subscription_plans ORDER BY created_at`);
    return rows.map(mapPlan);
  }

  async createSubscription(subscription: Subscription): Promise<void> {
    await this.pool.query(
      `INSERT INTO subscriptions
         (id, organization_id, plan_id, status, current_period_start, current_period_end,
          current_tokens_used, current_requests_used, stripe_subscription_id, created_at, cancelled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        subscription.id,
        subscription.organizationId,
        subscription.planId,
        subscription.status,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.currentTokensUsed,
        subscription.currentRequestsUsed,
        subscription.stripeSubscriptionId ?? null,
        subscription.createdAt,
        subscription.cancelledAt,
      ],
    );
  }

  async getSubscriptionById(subscriptionId: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM subscriptions WHERE id = $1`,
      [subscriptionId],
    );
    return rows[0] ? mapSubscription(rows[0]) : null;
  }

  async getActiveSubscriptionForOrg(organizationId: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM subscriptions
        WHERE organization_id = $1 AND status IN ('trialing', 'active', 'past_due')
        LIMIT 1`,
      [organizationId],
    );
    return rows[0] ? mapSubscription(rows[0]) : null;
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM subscriptions WHERE stripe_subscription_id = $1`,
      [stripeSubscriptionId],
    );
    return rows[0] ? mapSubscription(rows[0]) : null;
  }

  async updateSubscription(subscription: Subscription): Promise<void> {
    await this.pool.query(
      `UPDATE subscriptions
          SET plan_id = $2,
              status = $3,
              current_period_start = $4,
              current_period_end = $5,
              current_tokens_used = $6,
              current_requests_used = $7,
              cancelled_at = $8,
              stripe_subscription_id = $9
        WHERE id = $1`,
      [
        subscription.id,
        subscription.planId,
        subscription.status,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.currentTokensUsed,
        subscription.currentRequestsUsed,
        subscription.cancelledAt,
        subscription.stripeSubscriptionId ?? null,
      ],
    );
  }

  async appendUsageRecord(record: UsageRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_records (id, organization_id, subscription_id, tokens_used, request_count, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.id, record.organizationId, record.subscriptionId, record.tokensUsed, record.requestCount, record.recordedAt],
    );
  }

  async listUsageRecordsForSubscription(
    subscriptionId: string,
    opts?: { since?: Date },
  ): Promise<UsageRecord[]> {
    const { rows } = opts?.since
      ? await this.pool.query(
          `SELECT * FROM usage_records WHERE subscription_id = $1 AND recorded_at >= $2 ORDER BY recorded_at DESC`,
          [subscriptionId, opts.since],
        )
      : await this.pool.query(
          `SELECT * FROM usage_records WHERE subscription_id = $1 ORDER BY recorded_at DESC`,
          [subscriptionId],
        );
    return rows.map(mapUsageRecord);
  }

  async createInvoice(invoice: Invoice): Promise<void> {
    await this.pool.query(
      `INSERT INTO invoices
         (id, organization_id, subscription_id, invoice_number, period_start, period_end,
          total_cents, currency, status, stripe_invoice_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        invoice.id,
        invoice.organizationId,
        invoice.subscriptionId,
        invoice.invoiceNumber,
        invoice.periodStart,
        invoice.periodEnd,
        invoice.totalCents,
        invoice.currency,
        invoice.status,
        invoice.stripeInvoiceId ?? null,
        invoice.createdAt,
      ],
    );
  }

  async getInvoiceByStripeId(stripeInvoiceId: string): Promise<Invoice | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM invoices WHERE stripe_invoice_id = $1`,
      [stripeInvoiceId],
    );
    return rows[0] ? mapInvoice(rows[0]) : null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlan(row: any): SubscriptionPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    billingCycle: row.billing_cycle,
    basePriceCents: row.base_price_cents,
    currency: row.currency,
    monthlyTokenQuota: row.monthly_token_quota === null ? null : Number(row.monthly_token_quota),
    monthlyRequestQuota: row.monthly_request_quota === null ? null : Number(row.monthly_request_quota),
    maxDevices: row.max_devices,
    allowedChannels: row.allowed_channels,
    includedCapabilities: row.included_capabilities,
    stripePriceId: row.stripe_price_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubscription(row: any): Subscription {
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    currentTokensUsed: Number(row.current_tokens_used),
    currentRequestsUsed: Number(row.current_requests_used),
    stripeSubscriptionId: row.stripe_subscription_id,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    invoiceNumber: row.invoice_number,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalCents: row.total_cents,
    currency: row.currency,
    status: row.status,
    stripeInvoiceId: row.stripe_invoice_id,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUsageRecord(row: any): UsageRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    tokensUsed: Number(row.tokens_used),
    requestCount: row.request_count,
    recordedAt: row.recorded_at,
  };
}
