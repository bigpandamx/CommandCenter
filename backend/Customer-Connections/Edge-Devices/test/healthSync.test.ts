import { test } from "node:test";
import assert from "node:assert/strict";
import { registerEdgeDevice } from "../src/registration.js";
import { recordHeartbeat } from "../src/heartbeat.js";
import { sweepStaleEdgeDevices, signalPendingSync, DEGRADED_AFTER_SECONDS, OFFLINE_AFTER_SECONDS } from "../src/healthSync.js";
import { FakeEdgeDevicesRepository } from "./fakeRepository.js";

test("sweepStaleEdgeDevices marks a device degraded after missing the heartbeat window", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  const heartbeatAt = new Date("2026-07-20T12:00:00Z");
  await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {}, heartbeatAt);

  const sweepTime = new Date(heartbeatAt.getTime() + (DEGRADED_AFTER_SECONDS + 10) * 1000);
  const result = await sweepStaleEdgeDevices(repo, sweepTime);

  assert.equal(result.markedDegraded, 1);
  assert.equal(result.markedOffline, 0);
  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.status, "degraded");
});

test("sweepStaleEdgeDevices marks a device offline after missing the longer offline window", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  const heartbeatAt = new Date("2026-07-20T12:00:00Z");
  await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {}, heartbeatAt);

  const sweepTime = new Date(heartbeatAt.getTime() + (OFFLINE_AFTER_SECONDS + 10) * 1000);
  const result = await sweepStaleEdgeDevices(repo, sweepTime);

  assert.equal(result.markedOffline, 1);
  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.status, "offline");
});

test("sweepStaleEdgeDevices does not touch a device that heartbeated recently", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  const heartbeatAt = new Date("2026-07-20T12:00:00Z");
  await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {}, heartbeatAt);

  const sweepTime = new Date(heartbeatAt.getTime() + 10 * 1000);
  const result = await sweepStaleEdgeDevices(repo, sweepTime);

  assert.equal(result.markedDegraded, 0);
  assert.equal(result.markedOffline, 0);
  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.status, "active");
});

test("signalPendingSync flags only active org devices, skipping other orgs and offline devices", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const orgReg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW1", deploymentType: "hybrid" });
  const otherOrgReg = await registerEdgeDevice(repo, { organizationId: "org-2", name: "GW2", deploymentType: "hybrid" });
  const offlineReg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW3", deploymentType: "hybrid" });

  await recordHeartbeat(repo, orgReg.deviceId, orgReg.apiKey, {});
  await recordHeartbeat(repo, otherOrgReg.deviceId, otherOrgReg.apiKey, {});
  const offlineDevice = await repo.getDeviceById(offlineReg.deviceId);
  await repo.updateDevice({ ...offlineDevice!, status: "offline" });

  const count = await signalPendingSync(repo, "org-1", "policy updated");

  assert.equal(count, 1, "only the active org-1 device should be flagged");
  const flagged = await repo.getDeviceById(orgReg.deviceId);
  assert.equal(flagged?.pendingSync, true);
  assert.equal(flagged?.pendingSyncReason, "policy updated");

  const untouchedOtherOrg = await repo.getDeviceById(otherOrgReg.deviceId);
  assert.equal(untouchedOtherOrg?.pendingSync, false);

  const untouchedOffline = await repo.getDeviceById(offlineReg.deviceId);
  assert.equal(untouchedOffline?.pendingSync, false);
});
