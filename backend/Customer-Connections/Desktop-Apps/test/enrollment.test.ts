import { test } from "node:test";
import assert from "node:assert/strict";
import { enrollDevice, EnrollmentError, type PolicyResolver } from "../src/enrollment.js";
import { verifyDeviceKey } from "../../../Platform-Services/Authentication/src/deviceAuth.js";
import { defaultPolicyForTier } from "../../../Platform-Services/Subscriptions/src/policy.js";
import { FakeDesktopSyncRepository } from "./fakeRepository.js";

/** Matches the old hardcoded behavior enrollDevice used before resolvePolicy was injected -- fine for tests that aren't specifically exercising subscription-driven policy resolution (see Entitlements/test for those). */
const defaultPolicyResolver: PolicyResolver = async (org) => defaultPolicyForTier(org.entitlementTier);

function baseRepo() {
  const repo = new FakeDesktopSyncRepository();
  repo.organizations.set("org-1", {
    id: "org-1",
    name: "Acme Corp",
    entitlementTier: "standard",
    createdAt: new Date("2026-01-01"),
  });
  repo.tokens.set("tok-abc", {
    token: "tok-abc",
    organizationId: "org-1",
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    consumedAt: null,
    maxUses: 1,
    useCount: 0,
  });
  return repo;
}

test("enrollDevice registers a new device and returns a usable API key", async () => {
  const repo = baseRepo();
  const result = await enrollDevice(repo, {
    token: "tok-abc",
    fingerprint: "fp-machine-1",
    displayName: "Bobby's Laptop",
    platform: "macos",
    appVersion: "2.4.0",
  }, defaultPolicyResolver);

  assert.equal(result.organizationId, "org-1");
  assert.equal(result.organizationName, "Acme Corp");
  assert.equal(result.channel, "stable");
  assert.ok(result.deviceId);

  const stored = await repo.getDeviceById(result.deviceId);
  assert.ok(stored, "device should be persisted");
  assert.equal(stored?.status, "active");
  assert.notEqual(stored?.apiKeyHash, result.apiKey, "plaintext key must never equal stored hash");
  assert.ok(
    verifyDeviceKey(result.apiKey, stored!.apiKeyHash),
    "returned plaintext key must verify against the stored hash",
  );
});

test("enrollDevice marks the token consumed so it can't be reused past maxUses", async () => {
  const repo = baseRepo();
  await enrollDevice(repo, {
    token: "tok-abc",
    fingerprint: "fp-machine-1",
    displayName: "Device A",
    platform: "linux",
    appVersion: "2.4.0",
  }, defaultPolicyResolver);

  await assert.rejects(
    () =>
      enrollDevice(repo, {
        token: "tok-abc",
        fingerprint: "fp-machine-2",
        displayName: "Device B",
        platform: "linux",
        appVersion: "2.4.0",
      }, defaultPolicyResolver),
    (err: unknown) => err instanceof EnrollmentError && err.code === "token_exhausted",
  );
});

test("enrollDevice rejects an expired token", async () => {
  const repo = baseRepo();
  repo.tokens.set("tok-expired", {
    token: "tok-expired",
    organizationId: "org-1",
    createdAt: new Date("2020-01-01"),
    expiresAt: new Date("2020-02-01"),
    consumedAt: null,
    maxUses: 1,
    useCount: 0,
  });

  await assert.rejects(
    () =>
      enrollDevice(repo, {
        token: "tok-expired",
        fingerprint: "fp-x",
        displayName: "Device X",
        platform: "windows",
        appVersion: "2.4.0",
      }, defaultPolicyResolver),
    (err: unknown) => err instanceof EnrollmentError && err.code === "token_expired",
  );
});

test("enrollDevice rejects an unknown token", async () => {
  const repo = baseRepo();
  await assert.rejects(
    () =>
      enrollDevice(repo, {
        token: "does-not-exist",
        fingerprint: "fp-x",
        displayName: "Device X",
        platform: "windows",
        appVersion: "2.4.0",
      }, defaultPolicyResolver),
    (err: unknown) => err instanceof EnrollmentError && err.code === "invalid_token",
  );
});

test("re-enrolling the same fingerprint rotates the key instead of creating a duplicate device", async () => {
  const repo = baseRepo();
  repo.tokens.set("tok-second", {
    token: "tok-second",
    organizationId: "org-1",
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    consumedAt: null,
    maxUses: 1,
    useCount: 0,
  });

  const first = await enrollDevice(repo, {
    token: "tok-abc",
    fingerprint: "fp-shared",
    displayName: "Laptop",
    platform: "windows",
    appVersion: "2.3.0",
  }, defaultPolicyResolver);

  const second = await enrollDevice(repo, {
    token: "tok-second",
    fingerprint: "fp-shared",
    displayName: "Laptop (reinstalled)",
    platform: "windows",
    appVersion: "2.4.0",
  }, defaultPolicyResolver);

  assert.equal(second.deviceId, first.deviceId, "same fingerprint should reuse the device id");
  assert.equal(repo.devices.size, 1, "no duplicate device row should be created");

  const stored = await repo.getDeviceById(first.deviceId);
  assert.ok(
    verifyDeviceKey(second.apiKey, stored!.apiKeyHash),
    "new key should verify",
  );
  assert.equal(
    verifyDeviceKey(first.apiKey, stored!.apiKeyHash),
    false,
    "old key must be invalidated after rotation",
  );
});
