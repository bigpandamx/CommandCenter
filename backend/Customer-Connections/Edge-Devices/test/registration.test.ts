import { test } from "node:test";
import assert from "node:assert/strict";
import { registerEdgeDevice } from "../src/registration.js";
import { authenticateEdgeDevice, EdgeDeviceAuthError } from "../src/auth.js";
import { FakeEdgeDevicesRepository } from "./fakeRepository.js";

test("registerEdgeDevice creates a device in 'provisioning' status with a usable API key", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const result = await registerEdgeDevice(repo, {
    organizationId: "org-1",
    name: "Prod Gateway",
    deploymentType: "hybrid",
  });

  assert.equal(result.status, "provisioning");
  assert.ok(result.apiKey.startsWith("agt_"));
  assert.equal(result.apiKeyPrefix, result.apiKey.slice(0, 8));

  const stored = await repo.getDeviceById(result.deviceId);
  assert.ok(stored);
  assert.notEqual(stored?.apiKeyHash, result.apiKey, "plaintext key must never equal the stored hash");
});

test("authenticateEdgeDevice succeeds with the correct key", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const result = await registerEdgeDevice(repo, {
    organizationId: "org-1",
    name: "Gateway",
    deploymentType: "on_prem",
  });

  const device = await authenticateEdgeDevice(repo, result.deviceId, result.apiKey);
  assert.equal(device.id, result.deviceId);
});

test("authenticateEdgeDevice rejects a wrong key", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const result = await registerEdgeDevice(repo, {
    organizationId: "org-1",
    name: "Gateway",
    deploymentType: "on_prem",
  });

  await assert.rejects(
    () => authenticateEdgeDevice(repo, result.deviceId, "agt_totallywrongkeyvalueherenotreal"),
    (err: unknown) => err instanceof EdgeDeviceAuthError && err.code === "unauthorized",
  );
});

test("authenticateEdgeDevice rejects an unknown device id", async () => {
  const repo = new FakeEdgeDevicesRepository();
  await assert.rejects(
    () => authenticateEdgeDevice(repo, "ghost-device", "agt_whatever"),
    (err: unknown) => err instanceof EdgeDeviceAuthError && err.code === "device_not_found",
  );
});

test("authenticateEdgeDevice rejects a deactivated device even with the correct key", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const result = await registerEdgeDevice(repo, {
    organizationId: "org-1",
    name: "Gateway",
    deploymentType: "vpc",
  });
  const device = await repo.getDeviceById(result.deviceId);
  await repo.updateDevice({ ...device!, isActive: false });

  await assert.rejects(
    () => authenticateEdgeDevice(repo, result.deviceId, result.apiKey),
    (err: unknown) => err instanceof EdgeDeviceAuthError && err.code === "device_inactive",
  );
});

test("registerEdgeDevice stores optional fields (description, environment, ipAllowlist, metadata) when provided", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const result = await registerEdgeDevice(repo, {
    organizationId: "org-1",
    name: "Gateway",
    deploymentType: "hybrid",
    description: "Primary inference gateway",
    environment: "production",
    ipAllowlist: ["10.0.0.0/8"],
    metadata: { region: "us-east-1" },
  });
  const stored = await repo.getDeviceById(result.deviceId);
  assert.equal(stored?.description, "Primary inference gateway");
  assert.equal(stored?.environment, "production");
  assert.deepEqual(stored?.ipAllowlist, ["10.0.0.0/8"]);
  assert.deepEqual(stored?.metadata, { region: "us-east-1" });
});
