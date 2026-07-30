import { test } from "node:test";
import assert from "node:assert/strict";
import { registerEdgeDevice } from "../src/registration.js";
import { recordHeartbeat } from "../src/heartbeat.js";
import { signalPendingSync } from "../src/healthSync.js";
import { FakeEdgeDevicesRepository } from "./fakeRepository.js";

test("recordHeartbeat marks a provisioning device active and stamps lastHeartbeat", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  const now = new Date("2026-07-20T12:00:00Z");

  const result = await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {}, now);

  assert.equal(result.needsSync, false);
  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.status, "active");
  assert.equal(stored?.lastHeartbeat?.toISOString(), now.toISOString());
});

test("recordHeartbeat recovers a degraded device back to active", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  const device = await repo.getDeviceById(reg.deviceId);
  await repo.updateDevice({ ...device!, status: "degraded" });

  await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {});

  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.status, "active");
});

test("recordHeartbeat updates the version when provided", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });

  await recordHeartbeat(repo, reg.deviceId, reg.apiKey, { version: "1.4.2" });

  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.version, "1.4.2");
});

test("recordHeartbeat reflects needsSync=true when a policy push happened since the last heartbeat", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
  await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {}); // first heartbeat -> active

  await signalPendingSync(repo, "org-1", "policy updated by staff");

  const result = await recordHeartbeat(repo, reg.deviceId, reg.apiKey, {});
  assert.equal(result.needsSync, true);
});

test("recordHeartbeat rejects a bad key without touching the device", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });

  await assert.rejects(() => recordHeartbeat(repo, reg.deviceId, "agt_wrongkeyvalue", {}));

  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.status, "provisioning", "status must not change on a failed heartbeat auth");
});
