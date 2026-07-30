import { test } from "node:test";
import assert from "node:assert/strict";
import { enrollDevice, EnrollmentError, type PolicyResolver } from "../src/enrollment.js";
import { defaultPolicyForTier } from "../../../Platform-Services/Subscriptions/src/policy.js";
import { FakeDesktopSyncRepository } from "./fakeRepository.js";

/** These tests verify enrollDevice's OWN cap-enforcement logic given a policy, not policy resolution itself (see Subscriptions/Entitlements' own tests for that) -- the tier defaults this wraps are exactly what "trial cap is 3" etc. below are actually testing against. */
const defaultPolicyResolver: PolicyResolver = async (org) => defaultPolicyForTier(org.entitlementTier);

function trialRepoWithToken(tokenUses = { maxUses: 10, useCount: 0 }) {
  const repo = new FakeDesktopSyncRepository();
  repo.organizations.set("org-trial", {
    id: "org-trial",
    name: "Trial Org",
    entitlementTier: "trial", // cap is 3 per defaultPolicyForTier
    createdAt: new Date("2026-01-01"),
  });
  repo.tokens.set("tok", {
    token: "tok",
    organizationId: "org-trial",
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    consumedAt: null,
    maxUses: tokenUses.maxUses,
    useCount: tokenUses.useCount,
  });
  return repo;
}

test("enrollDevice allows enrollment up to the tier's device cap", async () => {
  const repo = trialRepoWithToken();

  for (let i = 0; i < 3; i++) {
    await enrollDevice(repo, {
      token: "tok",
      fingerprint: `fp-${i}`,
      displayName: `Device ${i}`,
      platform: "linux",
      appVersion: "2.4.0",
    }, defaultPolicyResolver);
  }

  assert.equal(repo.devices.size, 3);
});

test("enrollDevice rejects the 4th device on a trial org (cap is 3)", async () => {
  const repo = trialRepoWithToken();

  for (let i = 0; i < 3; i++) {
    await enrollDevice(repo, {
      token: "tok",
      fingerprint: `fp-${i}`,
      displayName: `Device ${i}`,
      platform: "linux",
      appVersion: "2.4.0",
    }, defaultPolicyResolver);
  }

  await assert.rejects(
    () =>
      enrollDevice(repo, {
        token: "tok",
        fingerprint: "fp-one-too-many",
        displayName: "Device 4",
        platform: "linux",
        appVersion: "2.4.0",
      }, defaultPolicyResolver),
    (err: unknown) => err instanceof EnrollmentError && err.code === "device_limit_reached",
  );
  assert.equal(repo.devices.size, 3, "the rejected enrollment must not have created a device");
});

test("re-enrolling an existing fingerprint does not count against the device cap", async () => {
  const repo = trialRepoWithToken({ maxUses: 10, useCount: 0 });

  for (let i = 0; i < 3; i++) {
    await enrollDevice(repo, {
      token: "tok",
      fingerprint: `fp-${i}`,
      displayName: `Device ${i}`,
      platform: "linux",
      appVersion: "2.4.0",
    }, defaultPolicyResolver);
  }

  // Org is now at its cap (3/3). Re-enrolling fp-0 (already-known fingerprint)
  // must still succeed since it rotates the existing device rather than adding one.
  const result = await enrollDevice(repo, {
    token: "tok",
    fingerprint: "fp-0",
    displayName: "Device 0 (reinstalled)",
    platform: "linux",
    appVersion: "2.5.0",
  }, defaultPolicyResolver);

  assert.equal(repo.devices.size, 3);
  const stored = await repo.getDeviceById(result.deviceId);
  assert.equal(stored?.fingerprint, "fp-0");
});

test("enrollDevice never rejects for enterprise orgs regardless of device count", async () => {
  const repo = new FakeDesktopSyncRepository();
  repo.organizations.set("org-ent", {
    id: "org-ent",
    name: "Enterprise Org",
    entitlementTier: "enterprise",
    createdAt: new Date("2026-01-01"),
  });
  repo.tokens.set("tok-ent", {
    token: "tok-ent",
    organizationId: "org-ent",
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    consumedAt: null,
    maxUses: 10,
    useCount: 0,
  });

  for (let i = 0; i < 5; i++) {
    await enrollDevice(repo, {
      token: "tok-ent",
      fingerprint: `fp-ent-${i}`,
      displayName: `Device ${i}`,
      platform: "windows",
      appVersion: "2.4.0",
    }, defaultPolicyResolver);
  }

  assert.equal(repo.devices.size, 5);
});

test("enrollDevice assigns the trial default channel (beta) from the resolved policy, not a hardcoded value", async () => {
  const repo = trialRepoWithToken();
  const result = await enrollDevice(repo, {
    token: "tok",
    fingerprint: "fp-channel-check",
    displayName: "Device",
    platform: "linux",
    appVersion: "2.4.0",
  }, defaultPolicyResolver);
  assert.equal(result.channel, "beta");
});
