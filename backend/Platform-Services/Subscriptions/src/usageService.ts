import { randomUUID } from "node:crypto";
import type { BillingRepository } from "./billingRepository.js";
import { getPlanForSubscription } from "./subscriptionService.js";
import type { RecordUsageInput, Subscription, UsageRecord } from "./billingTypes.js";

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly code: "token_quota_exceeded" | "request_quota_exceeded",
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * Throws if recording `input` would push the subscription over its plan's
 * quota. Checked BEFORE the usage is recorded (see recordUsage) so a
 * request that would exceed quota is rejected rather than recorded and
 * then flagged after the fact.
 */
export async function assertWithinQuota(
  repo: BillingRepository,
  subscription: Subscription,
  input: RecordUsageInput,
): Promise<void> {
  const plan = await getPlanForSubscription(repo, subscription);

  if (
    plan.monthlyTokenQuota !== null &&
    subscription.currentTokensUsed + input.tokensUsed > plan.monthlyTokenQuota
  ) {
    throw new QuotaExceededError(
      `Recording ${input.tokensUsed} tokens would exceed the monthly quota of ${plan.monthlyTokenQuota}`,
      "token_quota_exceeded",
    );
  }
  if (
    plan.monthlyRequestQuota !== null &&
    subscription.currentRequestsUsed + input.requestCount > plan.monthlyRequestQuota
  ) {
    throw new QuotaExceededError(
      `Recording ${input.requestCount} requests would exceed the monthly quota of ${plan.monthlyRequestQuota}`,
      "request_quota_exceeded",
    );
  }
}

/**
 * Records usage against a subscription's current period, enforcing quota
 * first. Appends an immutable UsageRecord and increments the
 * subscription's running counters in the same logical operation --
 * callers with a transactional repository implementation should wrap
 * both writes in one transaction (see Platform-Services/Databases).
 */
export async function recordUsage(
  repo: BillingRepository,
  subscription: Subscription,
  input: RecordUsageInput,
  now: Date = new Date(),
): Promise<UsageRecord> {
  await assertWithinQuota(repo, subscription, input);

  const record: UsageRecord = {
    id: randomUUID(),
    organizationId: subscription.organizationId,
    subscriptionId: subscription.id,
    tokensUsed: input.tokensUsed,
    requestCount: input.requestCount,
    recordedAt: now,
  };
  await repo.appendUsageRecord(record);

  await repo.updateSubscription({
    ...subscription,
    currentTokensUsed: subscription.currentTokensUsed + input.tokensUsed,
    currentRequestsUsed: subscription.currentRequestsUsed + input.requestCount,
  });

  return record;
}

export interface UnconditionalUsageResult {
  record: UsageRecord;
  overQuota: boolean;
}

/**
 * Records usage WITHOUT a pre-check, for resources where consumption
 * already happened before the cost was known -- LLM token usage being
 * the motivating case (Customer-Connections/AIChat): you only learn the
 * real token count after a completion finishes, so there's nothing
 * left to gate by the time you'd call `recordUsage`. Returns whether
 * this recording pushed the subscription over its plan's quota, so the
 * caller can react (warn, block the *next* request) without losing
 * track of spend that already happened. Unlike `recordUsage`, this
 * never throws `QuotaExceededError` -- rejecting an already-consumed
 * resource doesn't un-consume it; the org was billed by the provider
 * either way, and an internal counter that refuses to reflect that
 * would just be wrong, not protective.
 */
export async function recordUsageUnconditional(
  repo: BillingRepository,
  subscription: Subscription,
  input: RecordUsageInput,
  now: Date = new Date(),
): Promise<UnconditionalUsageResult> {
  const plan = await getPlanForSubscription(repo, subscription);

  const record: UsageRecord = {
    id: randomUUID(),
    organizationId: subscription.organizationId,
    subscriptionId: subscription.id,
    tokensUsed: input.tokensUsed,
    requestCount: input.requestCount,
    recordedAt: now,
  };
  await repo.appendUsageRecord(record);

  const newTokensUsed = subscription.currentTokensUsed + input.tokensUsed;
  const newRequestsUsed = subscription.currentRequestsUsed + input.requestCount;
  await repo.updateSubscription({
    ...subscription,
    currentTokensUsed: newTokensUsed,
    currentRequestsUsed: newRequestsUsed,
  });

  const overQuota =
    (plan.monthlyTokenQuota !== null && newTokensUsed > plan.monthlyTokenQuota) ||
    (plan.monthlyRequestQuota !== null && newRequestsUsed > plan.monthlyRequestQuota);

  return { record, overQuota };
}

export interface QuotaUsageSummary {
  tokens: { used: number; limit: number | null; remaining: number | null };
  requests: { used: number; limit: number | null; remaining: number | null };
}

export async function getQuotaUsage(
  repo: BillingRepository,
  subscription: Subscription,
): Promise<QuotaUsageSummary> {
  const plan = await getPlanForSubscription(repo, subscription);
  return {
    tokens: {
      used: subscription.currentTokensUsed,
      limit: plan.monthlyTokenQuota,
      remaining:
        plan.monthlyTokenQuota === null
          ? null
          : Math.max(plan.monthlyTokenQuota - subscription.currentTokensUsed, 0),
    },
    requests: {
      used: subscription.currentRequestsUsed,
      limit: plan.monthlyRequestQuota,
      remaining:
        plan.monthlyRequestQuota === null
          ? null
          : Math.max(plan.monthlyRequestQuota - subscription.currentRequestsUsed, 0),
    },
  };
}
