import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrganization, issueEnrollmentToken, revokeEnrollmentToken } from "../../Control-Plane/Organizations/src/organizationService.js";
import { enrollDevice, EnrollmentError, type PolicyResolver } from "../../Customer-Connections/Desktop-Apps/src/enrollment.js";
import { handleCheckin } from "../../Customer-Connections/Desktop-Apps/src/checkin.js";
import { defaultPolicyForTier } from "../../Platform-Services/Subscriptions/src/policy.js";
import { resolveEntitlementPolicy } from "../../Platform-Services/Subscriptions/src/resolvePolicy.js";
import { createPlan, subscribeOrganization } from "../../Platform-Services/Subscriptions/src/subscriptionService.js";
import { FakeBillingRepository } from "../../Platform-Services/Subscriptions/test/fakeBillingRepository.js";
import { CombinedFakeRepository } from "./combinedFakeRepository.js";

const defaultPolicyResolver: PolicyResolver = async (org) => defaultPolicyForTier(org.entitlementTier);

test("end-to-end: an org is created, a token is issued, and a device enrolls and checks in using it", async () => {
  const repo = new CombinedFakeRepository();

  const org = await createOrganization(repo, { name: "Acme Corp", entitlementTier: "enterprise" });
  const token = await issueEnrollmentToken(repo, { organizationId: org.id });

  const enrollment = await enrollDevice(repo, {
    token: token.token,
    fingerprint: "fp-integration-1",
    displayName: "QA Laptop",
    platform: "linux",
    appVersion: "2.4.0",
  }, defaultPolicyResolver);

  assert.equal(enrollment.organizationId, org.id);
  assert.equal(enrollment.channel, "stable"); // enterprise org -> stable default

  const checkin = await handleCheckin(
    repo,
    { deviceId: enrollment.deviceId, appVersion: "2.4.0", health: { uptimeSeconds: 60, lastErrorCode: null } },
    enrollment.apiKey,
  );
  assert.equal(checkin.updateAvailable, false);
});

test("end-to-end: a revoked token can no longer be used to enroll", async () => {
  const repo = new CombinedFakeRepository();
  const org = await createOrganization(repo, { name: "Acme Corp", entitlementTier: "trial" });
  const token = await issueEnrollmentToken(repo, { organizationId: org.id });

  await revokeEnrollmentToken(repo, token.token);

  await assert.rejects(
    () =>
      enrollDevice(repo, {
        token: token.token,
        fingerprint: "fp-integration-2",
        displayName: "Should Fail",
        platform: "windows",
        appVersion: "2.4.0",
      }, defaultPolicyResolver),
    (err: unknown) => err instanceof EnrollmentError && err.code === "token_expired",
  );
});

test("end-to-end: trial orgs default new devices to the beta channel", async () => {
  const repo = new CombinedFakeRepository();
  const org = await createOrganization(repo, { name: "Trial Co", entitlementTier: "trial" });
  const token = await issueEnrollmentToken(repo, { organizationId: org.id });

  const enrollment = await enrollDevice(repo, {
    token: token.token,
    fingerprint: "fp-trial-1",
    displayName: "Trial Device",
    platform: "macos",
    appVersion: "2.4.0",
  }, defaultPolicyResolver);

  assert.equal(enrollment.channel, "beta");
});

// --- resolveEntitlementPolicy actually wired into enrollDevice, end to end ---
//
// The pieces were already independently tested: resolveEntitlementPolicy's
// own test suite proves it derives the right policy from a subscription,
// and enrollDevice's own test suite proves it enforces whatever policy it's
// given. Neither proved the actual INTEGRATION -- that a real org's real
// subscription plan genuinely determines what enrollDevice enforces, through
// the real resolver, not a stub standing in for it. These do.

test("end-to-end: enrollDevice enforces the org's REAL subscription-derived device cap, not the static tier default, through the real resolveEntitlementPolicy", async () => {
  const repo = new CombinedFakeRepository();
  const billingRepo = new FakeBillingRepository();

  const org = await createOrganization(repo, { name: "Acme Corp", entitlementTier: "enterprise" }); // enterprise's own static default is a much higher cap
  await createPlan(billingRepo, {
    code: "startup-plan",
    name: "Startup Plan",
    billingCycle: "monthly",
    basePriceCents: 9900,
    maxDevices: 2, // deliberately lower than enterprise's own static default, so this test can only pass if the PLAN's cap is actually what's enforced
    allowedChannels: ["stable"],
  });
  await subscribeOrganization(billingRepo, org.id, "startup-plan");

  const realResolver: PolicyResolver = (o) => resolveEntitlementPolicy(billingRepo, o);
  const token = await issueEnrollmentToken(repo, { organizationId: org.id });

  await enrollDevice(repo, { token: token.token, fingerprint: "fp-1", displayName: "Device 1", platform: "linux", appVersion: "2.4.0" }, realResolver);
  const secondToken = await issueEnrollmentToken(repo, { organizationId: org.id });
  await enrollDevice(repo, { token: secondToken.token, fingerprint: "fp-2", displayName: "Device 2", platform: "linux", appVersion: "2.4.0" }, realResolver);

  const thirdToken = await issueEnrollmentToken(repo, { organizationId: org.id });
  await assert.rejects(
    () => enrollDevice(repo, { token: thirdToken.token, fingerprint: "fp-3", displayName: "Device 3", platform: "linux", appVersion: "2.4.0" }, realResolver),
    (err: unknown) => err instanceof EnrollmentError && err.code === "device_limit_reached",
    "the plan's own maxDevices (2), not enterprise's own higher static default, must be what's actually enforced",
  );
});

test("end-to-end: enrollDevice falls back to the static tier default, through the real resolveEntitlementPolicy, for an org with no active subscription", async () => {
  const repo = new CombinedFakeRepository();
  const billingRepo = new FakeBillingRepository(); // deliberately empty -- no plan, no subscription

  const org = await createOrganization(repo, { name: "Legacy Org", entitlementTier: "trial" }); // trial's own static default: 3 devices
  const realResolver: PolicyResolver = (o) => resolveEntitlementPolicy(billingRepo, o);

  for (let i = 1; i <= 3; i++) {
    const token = await issueEnrollmentToken(repo, { organizationId: org.id });
    await enrollDevice(repo, { token: token.token, fingerprint: `fp-${i}`, displayName: `Device ${i}`, platform: "linux", appVersion: "2.4.0" }, realResolver);
  }

  const fourthToken = await issueEnrollmentToken(repo, { organizationId: org.id });
  await assert.rejects(
    () => enrollDevice(repo, { token: fourthToken.token, fingerprint: "fp-4", displayName: "Device 4", platform: "linux", appVersion: "2.4.0" }, realResolver),
    (err: unknown) => err instanceof EnrollmentError && err.code === "device_limit_reached",
    "with no subscription, the real resolver must still correctly fall back to trial's own static 3-device default",
  );
});
