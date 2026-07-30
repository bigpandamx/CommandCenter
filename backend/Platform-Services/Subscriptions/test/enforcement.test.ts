import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPolicyForTier } from "../src/policy.js";
import {
  assertDeviceEnrollmentAllowed,
  assertChannelAllowed,
  deviceUsage,
  LicensingError,
} from "../src/enforcement.js";

test("defaultPolicyForTier: trial is capped at 3 devices, beta only, no gated capabilities", () => {
  const policy = defaultPolicyForTier("trial");
  assert.equal(policy.maxDevices, 3);
  assert.deepEqual(policy.allowedChannels, ["beta"]);
  assert.deepEqual(policy.capabilities, []);
});

test("defaultPolicyForTier: enterprise is unlimited devices, all channels, ai_chat included", () => {
  const policy = defaultPolicyForTier("enterprise");
  assert.equal(policy.maxDevices, null);
  assert.deepEqual(policy.allowedChannels, ["stable", "beta", "canary"]);
  assert.deepEqual(policy.capabilities, ["ai_chat"]);
});

test("defaultPolicyForTier: standard includes ai_chat", () => {
  const policy = defaultPolicyForTier("standard");
  assert.deepEqual(policy.capabilities, ["ai_chat"]);
});

test("assertDeviceEnrollmentAllowed passes when under the cap", () => {
  const policy = defaultPolicyForTier("standard");
  assert.doesNotThrow(() => assertDeviceEnrollmentAllowed(policy, 24));
});

test("assertDeviceEnrollmentAllowed throws once at the cap", () => {
  const policy = defaultPolicyForTier("standard");
  assert.throws(
    () => assertDeviceEnrollmentAllowed(policy, 25),
    (err: unknown) => err instanceof LicensingError && err.code === "device_limit_reached",
  );
});

test("assertDeviceEnrollmentAllowed never throws for unlimited (enterprise) policies", () => {
  const policy = defaultPolicyForTier("enterprise");
  assert.doesNotThrow(() => assertDeviceEnrollmentAllowed(policy, 100_000));
});

test("assertChannelAllowed rejects a channel outside the tier's policy", () => {
  const policy = defaultPolicyForTier("trial");
  assert.throws(
    () => assertChannelAllowed(policy, "canary"),
    (err: unknown) => err instanceof LicensingError && err.code === "channel_not_entitled",
  );
});

test("assertChannelAllowed passes for an allowed channel", () => {
  const policy = defaultPolicyForTier("enterprise");
  assert.doesNotThrow(() => assertChannelAllowed(policy, "canary"));
});

test("deviceUsage reports remaining seats for a capped tier", () => {
  const policy = defaultPolicyForTier("trial");
  assert.deepEqual(deviceUsage(policy, 1), { used: 1, limit: 3, remaining: 2 });
});

test("deviceUsage never goes negative when somehow over the cap", () => {
  const policy = defaultPolicyForTier("trial");
  assert.deepEqual(deviceUsage(policy, 5), { used: 5, limit: 3, remaining: 0 });
});

test("deviceUsage reports null limit/remaining for unlimited tiers", () => {
  const policy = defaultPolicyForTier("enterprise");
  assert.deepEqual(deviceUsage(policy, 500), { used: 500, limit: null, remaining: null });
});
