import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCheckin, CheckinError } from "../src/checkin.js";
import { generateDeviceKey } from "../../../Platform-Services/Authentication/src/deviceAuth.js";
import { FakeDesktopSyncRepository } from "./fakeRepository.js";
import type { Device } from "../src/types.js";

async function enrolledDevice(
  repo: FakeDesktopSyncRepository,
  overrides: Partial<Device> = {},
) {
  const key = generateDeviceKey("device-1");
  const device: Device = {
    id: "device-1",
    organizationId: "org-1",
    apiKeyHash: key.hash,
    fingerprint: "fp-1",
    displayName: "Test Device",
    platform: "linux",
    appVersion: "2.4.0",
    channel: "stable",
    status: "active",
    enrolledAt: new Date("2026-01-01"),
    lastCheckinAt: null,
    ...overrides,
  };
  await repo.createDevice(device);
  return { device, apiKey: key.plaintext };
}

test("handleCheckin rejects a wrong API key", async () => {
  const repo = new FakeDesktopSyncRepository();
  const { device } = await enrolledDevice(repo);

  await assert.rejects(
    () =>
      handleCheckin(
        repo,
        { deviceId: device.id, appVersion: "2.4.0", health: { uptimeSeconds: 10, lastErrorCode: null } },
        "dk_wrongkey_totallynotvalidkeyvaluehereatall12345",
      ),
    (err: unknown) => err instanceof CheckinError && err.code === "unauthorized",
  );
});

test("handleCheckin rejects a revoked device even with the correct key", async () => {
  const repo = new FakeDesktopSyncRepository();
  const { device, apiKey } = await enrolledDevice(repo, { status: "revoked" });

  await assert.rejects(
    () =>
      handleCheckin(
        repo,
        { deviceId: device.id, appVersion: "2.4.0", health: { uptimeSeconds: 10, lastErrorCode: null } },
        apiKey,
      ),
    (err: unknown) => err instanceof CheckinError && err.code === "device_revoked",
  );
});

test("handleCheckin updates lastCheckinAt and reports no update when already current", async () => {
  const repo = new FakeDesktopSyncRepository();
  const { device, apiKey } = await enrolledDevice(repo);
  repo.manifests.push({
    version: "2.4.0",
    channel: "stable",
    platform: "linux",
    publishedAt: new Date("2026-02-01"),
    downloadUrl: "https://cdn.example.com/aegis-2.4.0.AppImage",
    sha256: "deadbeef",
    minUpgradeFrom: null,
  });

  const now = new Date("2026-03-01T12:00:00Z");
  const response = await handleCheckin(
    repo,
    { deviceId: device.id, appVersion: "2.4.0", health: { uptimeSeconds: 500, lastErrorCode: null } },
    apiKey,
    now,
  );

  assert.equal(response.updateAvailable, false);
  assert.equal(response.latestVersion, null);
  assert.equal(response.nextCheckinSeconds, 15 * 60);

  const stored = await repo.getDeviceById(device.id);
  assert.equal(stored?.lastCheckinAt?.toISOString(), now.toISOString());
});

test("handleCheckin surfaces a newer manifest version and shortens the next interval", async () => {
  const repo = new FakeDesktopSyncRepository();
  const { device, apiKey } = await enrolledDevice(repo, { appVersion: "2.3.0" });
  repo.manifests.push({
    version: "2.4.0",
    channel: "stable",
    platform: "linux",
    publishedAt: new Date("2026-02-01"),
    downloadUrl: "https://cdn.example.com/aegis-2.4.0.AppImage",
    sha256: "deadbeef",
    minUpgradeFrom: null,
  });

  const response = await handleCheckin(
    repo,
    { deviceId: device.id, appVersion: "2.3.0", health: { uptimeSeconds: 500, lastErrorCode: null } },
    apiKey,
  );

  assert.equal(response.updateAvailable, true);
  assert.equal(response.latestVersion, "2.4.0");
  assert.equal(response.nextCheckinSeconds, 15 * 60 / 2);
});

test("handleCheckin returns pending commands and shortens the interval", async () => {
  const repo = new FakeDesktopSyncRepository();
  const { device, apiKey } = await enrolledDevice(repo);
  repo.commands.set(device.id, [
    { id: "cmd-1", type: "resync_config", issuedAt: new Date("2026-03-01") },
  ]);

  const response = await handleCheckin(
    repo,
    { deviceId: device.id, appVersion: "2.4.0", health: { uptimeSeconds: 500, lastErrorCode: null } },
    apiKey,
  );

  assert.equal(response.commands.length, 1);
  assert.equal(response.commands[0]?.type, "resync_config");
  assert.equal(response.nextCheckinSeconds, 15 * 60 / 2);
});

test("handleCheckin rejects an unknown device id", async () => {
  const repo = new FakeDesktopSyncRepository();
  await assert.rejects(
    () =>
      handleCheckin(
        repo,
        { deviceId: "ghost-device", appVersion: "2.4.0", health: { uptimeSeconds: 0, lastErrorCode: null } },
        "dk_whatever_notarealkeyvaluebutformattedplausiblyxxxx",
      ),
    (err: unknown) => err instanceof CheckinError && err.code === "device_not_found",
  );
});
