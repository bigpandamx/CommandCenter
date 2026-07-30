import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlan, subscribeOrganization } from "../src/subscriptionService.js";
import { resolveEntitlementPolicy } from "../src/resolvePolicy.js";
import { defaultPolicyForTier } from "../src/policy.js";
import { FakeBillingRepository } from "./fakeBillingRepository.js";

test("resolveEntitlementPolicy falls back to defaultPolicyForTier when the org has no active subscription", async () => {
  const repo = new FakeBillingRepository();
  const policy = await resolveEntitlementPolicy(repo, { id: "org-1", entitlementTier: "standard" });
  assert.deepEqual(policy, defaultPolicyForTier("standard"));
});

test("resolveEntitlementPolicy derives maxDevices/allowedChannels from the org's active plan when one exists", async () => {
  const repo = new FakeBillingRepository();
  await createPlan(repo, {
    code: "custom-enterprise",
    name: "Custom Enterprise",
    billingCycle: "annual",
    basePriceCents: 5_000_000,
    maxDevices: 500,
    allowedChannels: ["stable", "beta"],
  });
  await subscribeOrganization(repo, "org-1", "custom-enterprise");

  const policy = await resolveEntitlementPolicy(repo, { id: "org-1", entitlementTier: "trial" });

  // Note: maxDevices/allowedChannels come from the PLAN (500, stable+beta),
  // not from the org's static entitlementTier ("trial" would normally mean
  // 3 devices / beta-only) -- this is the whole point of plan-driven
  // resolution superseding the tier default once a subscription exists.
  assert.equal(policy.maxDevices, 500);
  assert.deepEqual(policy.allowedChannels, ["stable", "beta"]);
});

test("resolveEntitlementPolicy falls back for an org whose subscription was cancelled", async () => {
  const repo = new FakeBillingRepository();
  await createPlan(repo, {
    code: "custom",
    name: "Custom",
    billingCycle: "monthly",
    basePriceCents: 1000,
    maxDevices: 999,
    allowedChannels: ["canary"],
  });
  const sub = await subscribeOrganization(repo, "org-1", "custom");
  await repo.updateSubscription({ ...sub, status: "cancelled" });

  const policy = await resolveEntitlementPolicy(repo, { id: "org-1", entitlementTier: "enterprise" });
  assert.deepEqual(policy, defaultPolicyForTier("enterprise"));
});

test("resolveEntitlementPolicy derives capabilities from the org's active plan when one exists", async () => {
  const repo = new FakeBillingRepository();
  await createPlan(repo, {
    code: "ai-enabled",
    name: "AI Enabled",
    billingCycle: "monthly",
    basePriceCents: 10000,
    allowedChannels: ["stable"],
    includedCapabilities: ["ai_chat"],
  });
  await subscribeOrganization(repo, "org-1", "ai-enabled");

  const policy = await resolveEntitlementPolicy(repo, { id: "org-1", entitlementTier: "trial" });

  // Note: capabilities come from the PLAN (ai_chat included), not the
  // org's static "trial" tier default (which grants none) -- same
  // plan-supersedes-tier-default principle as maxDevices/allowedChannels.
  assert.deepEqual(policy.capabilities, ["ai_chat"]);
});

test("resolveEntitlementPolicy resolves an empty capabilities list for a plan that grants none, even though it has a real subscription", async () => {
  const repo = new FakeBillingRepository();
  await createPlan(repo, {
    code: "basic",
    name: "Basic",
    billingCycle: "monthly",
    basePriceCents: 500,
    allowedChannels: ["stable"],
    // includedCapabilities omitted -- defaults to []
  });
  await subscribeOrganization(repo, "org-1", "basic");

  const policy = await resolveEntitlementPolicy(repo, { id: "org-1", entitlementTier: "enterprise" });

  assert.deepEqual(policy.capabilities, [], "a real subscription with no granted capabilities should resolve to an empty list, not fall back to the enterprise tier default");
});
