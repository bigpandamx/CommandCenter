import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEntitlement, assertEntitled, EntitlementError } from "../src/entitlementEngine.js";
import { FakeBillingRepository } from "../../Subscriptions/test/fakeBillingRepository.js";
import { createPlan, subscribeOrganization } from "../../Subscriptions/src/subscriptionService.js";

test("checkEntitlement: capability check allows when the org's plan includes it", async () => {
  const repo = new FakeBillingRepository();
  await createPlan(repo, {
    code: "ai-plan",
    name: "AI Plan",
    billingCycle: "monthly",
    basePriceCents: 10000,
    allowedChannels: ["stable"],
    includedCapabilities: ["ai_chat"],
  });
  await subscribeOrganization(repo, "org-1", "ai-plan");

  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "trial" }, { type: "capability", capability: "ai_chat" });

  assert.equal(result.allowed, true);
});

test("checkEntitlement: capability check denies when the org's plan doesn't include it", async () => {
  const repo = new FakeBillingRepository();
  await createPlan(repo, {
    code: "basic-plan",
    name: "Basic Plan",
    billingCycle: "monthly",
    basePriceCents: 1000,
    allowedChannels: ["stable"],
    // no includedCapabilities -- defaults to []
  });
  await subscribeOrganization(repo, "org-1", "basic-plan");

  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "enterprise" }, { type: "capability", capability: "ai_chat" });

  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /does not include/);
});

test("checkEntitlement: capability check for an org with no active subscription falls back to the tier default", async () => {
  const repo = new FakeBillingRepository();

  const trialResult = await checkEntitlement(repo, { id: "org-1", entitlementTier: "trial" }, { type: "capability", capability: "ai_chat" });
  assert.equal(trialResult.allowed, false, "trial's default policy grants no gated capabilities");

  const enterpriseResult = await checkEntitlement(repo, { id: "org-2", entitlementTier: "enterprise" }, { type: "capability", capability: "ai_chat" });
  assert.equal(enterpriseResult.allowed, true, "enterprise's default policy includes ai_chat");
});

test("checkEntitlement: device_enrollment allows when under the cap", async () => {
  const repo = new FakeBillingRepository();
  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "standard" }, { type: "device_enrollment", currentDeviceCount: 5 });
  assert.equal(result.allowed, true);
});

test("checkEntitlement: device_enrollment denies at the cap, reusing Subscriptions' own boundary logic (not a reimplementation)", async () => {
  const repo = new FakeBillingRepository();
  // standard tier default: maxDevices 25
  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "standard" }, { type: "device_enrollment", currentDeviceCount: 25 });
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /device limit/);
});

test("checkEntitlement: device_enrollment never denies for an unlimited (null maxDevices) plan", async () => {
  const repo = new FakeBillingRepository();
  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "enterprise" }, { type: "device_enrollment", currentDeviceCount: 1_000_000 });
  assert.equal(result.allowed, true);
});

test("checkEntitlement: channel check allows an entitled channel", async () => {
  const repo = new FakeBillingRepository();
  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "enterprise" }, { type: "channel", channel: "canary" });
  assert.equal(result.allowed, true);
});

test("checkEntitlement: channel check denies a non-entitled channel", async () => {
  const repo = new FakeBillingRepository();
  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "trial" }, { type: "channel", channel: "canary" });
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /not entitled/);
});

test("checkEntitlement always returns the resolved policy, even when denying", async () => {
  const repo = new FakeBillingRepository();
  const result = await checkEntitlement(repo, { id: "org-1", entitlementTier: "trial" }, { type: "capability", capability: "ai_chat" });
  assert.equal(result.policy.tier, "trial");
  assert.deepEqual(result.policy.capabilities, []);
});

test("assertEntitled resolves with the policy when allowed", async () => {
  const repo = new FakeBillingRepository();
  const policy = await assertEntitled(repo, { id: "org-1", entitlementTier: "enterprise" }, { type: "capability", capability: "ai_chat" });
  assert.equal(policy.tier, "enterprise");
});

test("assertEntitled throws EntitlementError when denied, carrying the operation that was denied", async () => {
  const repo = new FakeBillingRepository();
  await assert.rejects(
    () => assertEntitled(repo, { id: "org-1", entitlementTier: "trial" }, { type: "capability", capability: "ai_chat" }),
    (err: unknown) => {
      if (!(err instanceof EntitlementError)) return false;
      assert.deepEqual(err.operation, { type: "capability", capability: "ai_chat" });
      return true;
    },
  );
});
