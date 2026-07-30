import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPlan,
  subscribeOrganization,
  changeSubscriptionPlan,
  cancelSubscription,
  getPlanForSubscription,
  BillingError,
} from "../src/subscriptionService.js";
import { FakeBillingRepository } from "./fakeBillingRepository.js";

async function seedPlan(repo: FakeBillingRepository, overrides: Partial<Parameters<typeof createPlan>[1]> = {}) {
  return createPlan(repo, {
    code: "standard-monthly",
    name: "Standard (Monthly)",
    billingCycle: "monthly",
    basePriceCents: 49900,
    monthlyTokenQuota: 1_000_000,
    monthlyRequestQuota: 10_000,
    maxDevices: 25,
    allowedChannels: ["stable"],
    ...overrides,
  });
}

test("createPlan rejects a duplicate code", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo);
  await assert.rejects(
    () => seedPlan(repo),
    (err: unknown) => err instanceof BillingError && err.code === "duplicate_plan_code",
  );
});

test("createPlan defaults currency to usd and quotas to null when omitted", async () => {
  const repo = new FakeBillingRepository();
  const plan = await createPlan(repo, {
    code: "unlimited",
    name: "Unlimited",
    billingCycle: "annual",
    basePriceCents: 999900,
    allowedChannels: ["stable", "beta", "canary"],
  });
  assert.equal(plan.currency, "usd");
  assert.equal(plan.monthlyTokenQuota, null);
  assert.equal(plan.maxDevices, null);
});

test("subscribeOrganization creates an active subscription with a computed period end", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo);
  const now = new Date("2026-01-15T00:00:00Z");

  const sub = await subscribeOrganization(repo, "org-1", "standard-monthly", now);

  assert.equal(sub.status, "active");
  assert.equal(sub.organizationId, "org-1");
  assert.equal(sub.currentPeriodStart.toISOString(), now.toISOString());
  assert.equal(sub.currentPeriodEnd.toISOString(), "2026-02-15T00:00:00.000Z");
  assert.equal(sub.currentTokensUsed, 0);
});

test("subscribeOrganization to the trial plan code starts in 'trialing' status", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo, { code: "trial", name: "Trial", maxDevices: 3, allowedChannels: ["beta"] });
  const sub = await subscribeOrganization(repo, "org-1", "trial");
  assert.equal(sub.status, "trialing");
});

test("subscribeOrganization rejects an unknown plan code", async () => {
  const repo = new FakeBillingRepository();
  await assert.rejects(
    () => subscribeOrganization(repo, "org-1", "ghost-plan"),
    (err: unknown) => err instanceof BillingError && err.code === "plan_not_found",
  );
});

test("subscribeOrganization rejects a second subscription for an already-subscribed org", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo);
  await subscribeOrganization(repo, "org-1", "standard-monthly");
  await assert.rejects(
    () => subscribeOrganization(repo, "org-1", "standard-monthly"),
    (err: unknown) => err instanceof BillingError && err.code === "already_subscribed",
  );
});

test("changeSubscriptionPlan swaps the plan and resets usage counters", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo);
  await seedPlan(repo, { code: "enterprise-annual", billingCycle: "annual", maxDevices: null, allowedChannels: ["stable", "beta", "canary"] });

  const sub = await subscribeOrganization(repo, "org-1", "standard-monthly");
  await repo.updateSubscription({ ...sub, currentTokensUsed: 5000, currentRequestsUsed: 50 });

  const updated = await changeSubscriptionPlan(repo, "org-1", "enterprise-annual");
  const newPlan = await getPlanForSubscription(repo, updated);

  assert.equal(newPlan.code, "enterprise-annual");
  assert.equal(updated.currentTokensUsed, 0, "usage counters should reset on plan change");
});

test("changeSubscriptionPlan rejects an org with no active subscription", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo);
  await assert.rejects(
    () => changeSubscriptionPlan(repo, "org-without-sub", "standard-monthly"),
    (err: unknown) => err instanceof BillingError && err.code === "no_active_subscription",
  );
});

test("cancelSubscription marks the subscription cancelled and stamps cancelledAt", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo);
  const sub = await subscribeOrganization(repo, "org-1", "standard-monthly");
  const now = new Date("2026-03-01T00:00:00Z");

  await cancelSubscription(repo, "org-1", now);

  const stored = await repo.getSubscriptionById(sub.id);
  assert.equal(stored?.status, "cancelled");
  assert.equal(stored?.cancelledAt?.toISOString(), now.toISOString());
});

test("a cancelled subscription no longer counts as 'active' for re-subscription purposes", async () => {
  const repo = new FakeBillingRepository();
  await seedPlan(repo);
  await subscribeOrganization(repo, "org-1", "standard-monthly");
  await cancelSubscription(repo, "org-1");

  // Should succeed now -- no active subscription blocking it.
  const resub = await subscribeOrganization(repo, "org-1", "standard-monthly");
  assert.equal(resub.status, "active");
});
