import { test } from "node:test";
import assert from "node:assert/strict";
import { registerEdgeDevice } from "../src/registration.js";
import { recordPolicySyncAck } from "../src/policySync.js";
import { signalPendingSync } from "../src/healthSync.js";
import { recordHeartbeat } from "../src/heartbeat.js";
import { EdgeDeviceAuthError } from "../src/auth.js";
import { FakeEdgeDevicesRepository } from "./fakeRepository.js";

test("recordPolicySyncAck clears pendingSync and records the delivered version", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  await signalPendingSync(repo, "org-1", "policy updated");

  const before = await repo.getDeviceById(reg.deviceId);
  assert.equal(before?.pendingSync, true, "sanity check: pendingSync should be set before the ack");

  const now = new Date("2026-07-20T12:00:00Z");
  await recordPolicySyncAck(repo, reg.deviceId, reg.apiKey, "policy-v42", now);

  const after = await repo.getDeviceById(reg.deviceId);
  assert.equal(after?.pendingSync, false);
  assert.equal(after?.pendingSyncReason, null);
  assert.equal(after?.policySnapshotVersion, "policy-v42");
  assert.equal(after?.lastPolicySync?.toISOString(), now.toISOString());
});

test("recordPolicySyncAck's needsSync clearing is actually visible to the next heartbeat -- the real end-to-end property that matters", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  await signalPendingSync(repo, "org-1", "policy updated");

  const heartbeatBefore = await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {});
  assert.equal(heartbeatBefore.needsSync, true, "sanity check: heartbeat should report needsSync before the ack");

  await recordPolicySyncAck(repo, reg.deviceId, reg.apiKey, "policy-v42");

  const heartbeatAfter = await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {});
  assert.equal(heartbeatAfter.needsSync, false, "a subsequent heartbeat must see the cleared flag");
  assert.equal(heartbeatAfter.policySnapshotVersion, "policy-v42");
});

test("recordPolicySyncAck rejects an invalid API key and does not touch the device", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  await signalPendingSync(repo, "org-1", "policy updated");

  await assert.rejects(
    () => recordPolicySyncAck(repo, reg.deviceId, "wrong-key", "policy-v42"),
    (err: unknown) => err instanceof EdgeDeviceAuthError,
  );

  // Nothing should have changed -- a rejected ack must not clear
  // pendingSync or record a version for a device that didn't actually
  // prove it received the policy.
  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.pendingSync, true);
  assert.equal(stored?.policySnapshotVersion, null);
});

test("recordPolicySyncAck rejects an unknown device id", async () => {
  const repo = new FakeEdgeDevicesRepository();
  await assert.rejects(
    () => recordPolicySyncAck(repo, "ghost-device", "any-key", "policy-v42"),
    (err: unknown) => err instanceof EdgeDeviceAuthError,
  );
});

test("recordPolicySyncAck leaves unrelated device fields untouched", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  const beforeStatus = (await repo.getDeviceById(reg.deviceId))?.status;

  await recordPolicySyncAck(repo, reg.deviceId, reg.apiKey, "policy-v1");

  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.status, beforeStatus, "status shouldn't change as a side effect of a policy ack");
  assert.equal(stored?.name, "GW");
  assert.equal(stored?.organizationId, "org-1");
});

test("recordPolicySyncAck works even without a prior signalPendingSync -- an ad-hoc/first sync, not only a reaction to a flagged change", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });

  const result = await recordPolicySyncAck(repo, reg.deviceId, reg.apiKey, "policy-v1");

  assert.equal(result.policySnapshotVersion, "policy-v1");
  assert.equal(result.pendingSync, false);
});
