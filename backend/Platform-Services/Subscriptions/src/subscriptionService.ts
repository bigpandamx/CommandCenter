import { randomUUID } from "node:crypto";
import type { BillingRepository } from "./billingRepository.js";
import type {
  CreatePlanInput,
  Subscription,
  SubscriptionPlan,
} from "./billingTypes.js";

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "plan_not_found"
      | "plan_inactive"
      | "duplicate_plan_code"
      | "organization_not_found"
      | "no_active_subscription"
      | "already_subscribed"
      | "plan_missing_stripe_price"
      | "stripe_subscription_customer_mismatch",
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export async function createPlan(
  repo: BillingRepository,
  input: CreatePlanInput,
  now: Date = new Date(),
): Promise<SubscriptionPlan> {
  const existing = await repo.getPlanByCode(input.code);
  if (existing) {
    throw new BillingError(`A plan with code "${input.code}" already exists`, "duplicate_plan_code");
  }

  const plan: SubscriptionPlan = {
    id: randomUUID(),
    code: input.code,
    name: input.name,
    billingCycle: input.billingCycle,
    basePriceCents: input.basePriceCents,
    currency: input.currency ?? "usd",
    monthlyTokenQuota: input.monthlyTokenQuota ?? null,
    monthlyRequestQuota: input.monthlyRequestQuota ?? null,
    maxDevices: input.maxDevices ?? null,
    allowedChannels: input.allowedChannels,
    includedCapabilities: input.includedCapabilities ?? [],
    stripePriceId: input.stripePriceId ?? null,
    isActive: true,
    createdAt: now,
  };
  await repo.createPlan(plan);
  return plan;
}

function periodEndFor(cycle: SubscriptionPlan["billingCycle"], start: Date): Date {
  const end = new Date(start);
  switch (cycle) {
    case "monthly":
      end.setUTCMonth(end.getUTCMonth() + 1);
      return end;
    case "quarterly":
      end.setUTCMonth(end.getUTCMonth() + 3);
      return end;
    case "annual":
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      return end;
    case "usage_based":
      // Usage-based plans still get a nominal monthly period for quota
      // and reporting purposes, even though price isn't tied to it.
      end.setUTCMonth(end.getUTCMonth() + 1);
      return end;
  }
}

/**
 * Subscribes an organization to a plan. An org may have at most one
 * active (non-cancelled/non-expired) subscription at a time -- call
 * changeSubscriptionPlan to move an already-subscribed org to a
 * different plan rather than calling this again.
 */
export async function subscribeOrganization(
  repo: BillingRepository,
  organizationId: string,
  planCode: string,
  now: Date = new Date(),
): Promise<Subscription> {
  const plan = await repo.getPlanByCode(planCode);
  if (!plan) {
    throw new BillingError(`Unknown plan code "${planCode}"`, "plan_not_found");
  }
  if (!plan.isActive) {
    throw new BillingError(`Plan "${planCode}" is no longer available`, "plan_inactive");
  }

  const existing = await repo.getActiveSubscriptionForOrg(organizationId);
  if (existing) {
    throw new BillingError(
      "Organization already has an active subscription -- use changeSubscriptionPlan instead",
      "already_subscribed",
    );
  }

  const subscription: Subscription = {
    id: randomUUID(),
    organizationId,
    planId: plan.id,
    status: plan.code === "trial" ? "trialing" : "active",
    currentPeriodStart: now,
    currentPeriodEnd: periodEndFor(plan.billingCycle, now),
    currentTokensUsed: 0,
    currentRequestsUsed: 0,
    createdAt: now,
    cancelledAt: null,
  };
  await repo.createSubscription(subscription);
  return subscription;
}

export async function changeSubscriptionPlan(
  repo: BillingRepository,
  organizationId: string,
  newPlanCode: string,
  now: Date = new Date(),
): Promise<Subscription> {
  const current = await repo.getActiveSubscriptionForOrg(organizationId);
  if (!current) {
    throw new BillingError("Organization has no active subscription to change", "no_active_subscription");
  }
  const plan = await repo.getPlanByCode(newPlanCode);
  if (!plan) {
    throw new BillingError(`Unknown plan code "${newPlanCode}"`, "plan_not_found");
  }
  if (!plan.isActive) {
    throw new BillingError(`Plan "${newPlanCode}" is no longer available`, "plan_inactive");
  }

  // Plan change takes effect immediately and starts a fresh period rather
  // than prorating -- proration needs real payment-processor integration
  // to do honestly (partial refunds/charges), which is explicitly out of
  // scope here. Document the simplification rather than fake the math.
  const updated: Subscription = {
    ...current,
    planId: plan.id,
    currentPeriodStart: now,
    currentPeriodEnd: periodEndFor(plan.billingCycle, now),
    currentTokensUsed: 0,
    currentRequestsUsed: 0,
  };
  await repo.updateSubscription(updated);
  return updated;
}

export async function cancelSubscription(
  repo: BillingRepository,
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const current = await repo.getActiveSubscriptionForOrg(organizationId);
  if (!current) {
    throw new BillingError("Organization has no active subscription to cancel", "no_active_subscription");
  }
  await repo.updateSubscription({ ...current, status: "cancelled", cancelledAt: now });
}

export async function getPlanForSubscription(
  repo: BillingRepository,
  subscription: Subscription,
): Promise<SubscriptionPlan> {
  const plan = await repo.getPlanById(subscription.planId);
  if (!plan) {
    // A subscription pointing at a deleted/missing plan is a data
    // integrity problem, not a normal "not found" -- surface it loudly
    // rather than silently falling back to some default.
    throw new BillingError(
      `Subscription ${subscription.id} references missing plan ${subscription.planId}`,
      "plan_not_found",
    );
  }
  return plan;
}
