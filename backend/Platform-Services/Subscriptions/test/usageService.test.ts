import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlan, subscribeOrganization } from "../src/subscriptionService.js";
import { recordUsage, assertWithinQuota, getQuotaUsage, recordUsageUnconditional, QuotaExceededError } from "../src/usageService.js";
import { FakeBillingRepository } from "./fakeBillingRepository.js";

async function seedSubscribedOrg(repo: FakeBillingRepository, quotas: { tokens?: number | null; requests?: number | null } = {}) {
  await createPlan(repo, {
    code: "metered",
    name: "Metered",
    billingCycle: "monthly",
    basePriceCents: 10000,
    monthlyTokenQuota: "tokens" in quotas ? quotas.tokens ?? null : 1000,
    monthlyRequestQuota: "requests" in quotas ? quotas.requests ?? null : 100,
    allowedChannels: ["stable"],
  });
  return subscribeOrganization(repo, "org-1", "metered");
}

test("recordUsage appends a record and increments the subscription's running totals", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo);

  await recordUsage(repo, sub, { tokensUsed: 100, requestCount: 2 });

  const updated = await repo.getSubscriptionById(sub.id);
  assert.equal(updated?.currentTokensUsed, 100);
  assert.equal(updated?.currentRequestsUsed, 2);
  assert.equal(repo.usageRecords.length, 1);
  assert.equal(repo.usageRecords[0]?.organizationId, "org-1");
});

test("recordUsage accumulates across multiple calls", async () => {
  const repo = new FakeBillingRepository();
  let sub = await seedSubscribedOrg(repo);

  await recordUsage(repo, sub, { tokensUsed: 100, requestCount: 1 });
  sub = (await repo.getSubscriptionById(sub.id))!;
  await recordUsage(repo, sub, { tokensUsed: 150, requestCount: 1 });

  const final = await repo.getSubscriptionById(sub.id);
  assert.equal(final?.currentTokensUsed, 250);
  assert.equal(final?.currentRequestsUsed, 2);
});

test("recordUsage throws token_quota_exceeded and does NOT record when it would exceed the token quota", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: 100 });

  await assert.rejects(
    () => recordUsage(repo, sub, { tokensUsed: 101, requestCount: 1 }),
    (err: unknown) => err instanceof QuotaExceededError && err.code === "token_quota_exceeded",
  );
  assert.equal(repo.usageRecords.length, 0, "over-quota usage must not be recorded");
  const unchanged = await repo.getSubscriptionById(sub.id);
  assert.equal(unchanged?.currentTokensUsed, 0, "counters must not change on a rejected call");
});

test("recordUsage allows usage that lands exactly at the quota", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: 100 });
  await assert.doesNotReject(() => recordUsage(repo, sub, { tokensUsed: 100, requestCount: 1 }));
});

test("recordUsage throws request_quota_exceeded independently of token quota", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: 1_000_000, requests: 5 });

  await assert.rejects(
    () => recordUsage(repo, sub, { tokensUsed: 1, requestCount: 6 }),
    (err: unknown) => err instanceof QuotaExceededError && err.code === "request_quota_exceeded",
  );
});

test("assertWithinQuota never throws for a plan with null (unlimited) quotas", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: null, requests: null });
  await assert.doesNotReject(() => assertWithinQuota(repo, sub, { tokensUsed: 10_000_000, requestCount: 1_000_000 }));
});

test("getQuotaUsage reports used/limit/remaining correctly", async () => {
  const repo = new FakeBillingRepository();
  let sub = await seedSubscribedOrg(repo, { tokens: 1000, requests: 50 });
  sub = await recordUsage(repo, sub, { tokensUsed: 300, requestCount: 10 }).then(async () => (await repo.getSubscriptionById(sub.id))!);

  const usage = await getQuotaUsage(repo, sub);
  assert.deepEqual(usage.tokens, { used: 300, limit: 1000, remaining: 700 });
  assert.deepEqual(usage.requests, { used: 10, limit: 50, remaining: 40 });
});

test("getQuotaUsage reports null limit/remaining for unlimited quotas", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: null, requests: null });
  const usage = await getQuotaUsage(repo, sub);
  assert.deepEqual(usage.tokens, { used: 0, limit: null, remaining: null });
});

test("recordUsageUnconditional records usage and reports overQuota: false when within limits", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: 1000, requests: 50 });

  const result = await recordUsageUnconditional(repo, sub, { tokensUsed: 300, requestCount: 5 });

  assert.equal(result.overQuota, false);
  const updated = await repo.getSubscriptionById(sub.id);
  assert.equal(updated?.currentTokensUsed, 300);
  assert.equal(updated?.currentRequestsUsed, 5);
});

test("recordUsageUnconditional records usage EVEN WHEN it pushes the subscription over quota -- it never refuses to track real spend", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: 1000, requests: 50 });

  const result = await recordUsageUnconditional(repo, sub, { tokensUsed: 1500, requestCount: 1 });

  assert.equal(result.overQuota, true, "1500 > 1000 token quota should be reported as over");
  const updated = await repo.getSubscriptionById(sub.id);
  assert.equal(updated?.currentTokensUsed, 1500, "the real usage must still be recorded, not discarded");
});

test("recordUsageUnconditional never throws QuotaExceededError, unlike recordUsage", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: 100, requests: 1 });

  await assert.doesNotReject(() => recordUsageUnconditional(repo, sub, { tokensUsed: 10_000, requestCount: 100 }));
});

test("recordUsageUnconditional reports overQuota: false for a plan with null (unlimited) quotas, no matter how much is recorded", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: null, requests: null });

  const result = await recordUsageUnconditional(repo, sub, { tokensUsed: 10_000_000, requestCount: 1_000_000 });

  assert.equal(result.overQuota, false);
});

test("recordUsageUnconditional reports overQuota based on request count too, not just tokens", async () => {
  const repo = new FakeBillingRepository();
  const sub = await seedSubscribedOrg(repo, { tokens: 1_000_000, requests: 5 });

  const result = await recordUsageUnconditional(repo, sub, { tokensUsed: 1, requestCount: 6 });

  assert.equal(result.overQuota, true);
});
