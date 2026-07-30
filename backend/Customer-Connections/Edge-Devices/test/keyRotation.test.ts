import { test } from "node:test";
import assert from "node:assert/strict";
import { registerEdgeDevice } from "../src/registration.js";
import { authenticateEdgeDevice, EdgeDeviceAuthError } from "../src/auth.js";
import { rotateEdgeDeviceKey, deregisterEdgeDevice, EdgeDeviceNotFoundError } from "../src/keyRotation.js";
import { FakeEdgeDevicesRepository } from "./fakeRepository.js";

test("rotateEdgeDeviceKey issues a new key and immediately invalidates the old one", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });

  const rotated = await rotateEdgeDeviceKey(repo, reg.deviceId);

  assert.notEqual(rotated.apiKey, reg.apiKey);
  await assert.rejects(
    () => authenticateEdgeDevice(repo, reg.deviceId, reg.apiKey),
    (err: unknown) => err instanceof EdgeDeviceAuthError && err.code === "unauthorized",
  );
  const device = await authenticateEdgeDevice(repo, reg.deviceId, rotated.apiKey);
  assert.equal(device.id, reg.deviceId);
});

test("rotateEdgeDeviceKey throws for an unknown device", async () => {
  const repo = new FakeEdgeDevicesRepository();
  await assert.rejects(() => rotateEdgeDeviceKey(repo, "ghost-device"), EdgeDeviceNotFoundError);
});

test("deregisterEdgeDevice deactivates the device so it can no longer authenticate", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });

  await deregisterEdgeDevice(repo, reg.deviceId);

  await assert.rejects(
    () => authenticateEdgeDevice(repo, reg.deviceId, reg.apiKey),
    (err: unknown) => err instanceof EdgeDeviceAuthError && err.code === "device_inactive",
  );
});

test("deregisterEdgeDevice throws for an unknown device", async () => {
  const repo = new FakeEdgeDevicesRepository();
  await assert.rejects(() => deregisterEdgeDevice(repo, "ghost-device"), EdgeDeviceNotFoundError);
});
