import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDeviceKey } from "../../../Platform-Services/Authentication/src/deviceAuth.js";
import { ingestTelemetry, validateTelemetryBatch, TelemetryError } from "../src/telemetry.js";
import { FakeDesktopSyncRepository, FakeTelemetryRepository } from "./fakeRepository.js";
import type { Device, TelemetryEventInput } from "../src/types.js";

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

function usageEvent(occurredAt: Date, payload: Record<string, unknown> = { views: 3 }): TelemetryEventInput {
  return { type: "usage_metric", occurredAt, payload };
}

// --- validateTelemetryBatch (pure) ---

test("validateTelemetryBatch rejects an empty batch", () => {
  assert.throws(
    () => validateTelemetryBatch([]),
    (err: unknown) => err instanceof TelemetryError && err.code === "empty_batch",
  );
});

test("validateTelemetryBatch rejects a batch over the max size", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const events = Array.from({ length: 501 }, () => usageEvent(now));
  assert.throws(
    () => validateTelemetryBatch(events, now),
    (err: unknown) => err instanceof TelemetryError && err.code === "batch_too_large",
  );
});

test("validateTelemetryBatch accepts exactly the max batch size", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const events = Array.from({ length: 500 }, () => usageEvent(now));
  assert.doesNotThrow(() => validateTelemetryBatch(events, now));
});

test("validateTelemetryBatch rejects an oversized payload", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const hugeString = "x".repeat(40 * 1024);
  assert.throws(
    () => validateTelemetryBatch([usageEvent(now, { blob: hugeString })], now),
    (err: unknown) => err instanceof TelemetryError && err.code === "invalid_event",
  );
});

test("validateTelemetryBatch rejects an event dated too far in the future", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const tooFarFuture = new Date(now.getTime() + 10 * 60 * 1000); // 10 min ahead, past the 5 min skew allowance
  assert.throws(
    () => validateTelemetryBatch([usageEvent(tooFarFuture)], now),
    (err: unknown) => err instanceof TelemetryError && err.code === "invalid_event",
  );
});

test("validateTelemetryBatch allows a small amount of clock skew into the future", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const slightlyAhead = new Date(now.getTime() + 60 * 1000); // 1 min ahead
  assert.doesNotThrow(() => validateTelemetryBatch([usageEvent(slightlyAhead)], now));
});

test("validateTelemetryBatch rejects an event older than the max backfill window", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const wayOld = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
  assert.throws(
    () => validateTelemetryBatch([usageEvent(wayOld)], now),
    (err: unknown) => err instanceof TelemetryError && err.code === "invalid_event",
  );
});

test("validateTelemetryBatch allows an event just inside the backfill window", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const almostTooOld = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000); // 29 days ago
  assert.doesNotThrow(() => validateTelemetryBatch([usageEvent(almostTooOld)], now));
});

// --- ingestTelemetry (authenticated, stateful) ---

test("ingestTelemetry stores events tagged with the device's org and device id", async () => {
  const desktopRepo = new FakeDesktopSyncRepository();
  const telemetryRepo = new FakeTelemetryRepository();
  const { device, apiKey } = await enrolledDevice(desktopRepo);
  const now = new Date("2026-07-20T00:00:00Z");

  const result = await ingestTelemetry(
    desktopRepo,
    telemetryRepo,
    { deviceId: device.id, events: [usageEvent(now), usageEvent(now, { errors: 1 })] },
    apiKey,
    now,
  );

  assert.equal(result.accepted, 2);
  assert.equal(telemetryRepo.events.length, 2);
  for (const stored of telemetryRepo.events) {
    assert.equal(stored.deviceId, device.id);
    assert.equal(stored.organizationId, device.organizationId);
    assert.ok(stored.id);
    assert.equal(stored.receivedAt.getTime(), now.getTime());
  }
});

test("ingestTelemetry rejects a wrong API key without storing anything", async () => {
  const desktopRepo = new FakeDesktopSyncRepository();
  const telemetryRepo = new FakeTelemetryRepository();
  const { device } = await enrolledDevice(desktopRepo);
  const now = new Date("2026-07-20T00:00:00Z");

  await assert.rejects(
    () =>
      ingestTelemetry(
        desktopRepo,
        telemetryRepo,
        { deviceId: device.id, events: [usageEvent(now)] },
        "dk_wrongkey_totallynotvalidkeyvaluehereatall12345",
        now,
      ),
    (err: unknown) => err instanceof TelemetryError && err.code === "unauthorized",
  );
  assert.equal(telemetryRepo.events.length, 0);
});

test("ingestTelemetry rejects a revoked device", async () => {
  const desktopRepo = new FakeDesktopSyncRepository();
  const telemetryRepo = new FakeTelemetryRepository();
  const { device, apiKey } = await enrolledDevice(desktopRepo, { status: "revoked" });
  const now = new Date("2026-07-20T00:00:00Z");

  await assert.rejects(
    () =>
      ingestTelemetry(
        desktopRepo,
        telemetryRepo,
        { deviceId: device.id, events: [usageEvent(now)] },
        apiKey,
        now,
      ),
    (err: unknown) => err instanceof TelemetryError && err.code === "device_revoked",
  );
});

test("ingestTelemetry rejects an unknown device id", async () => {
  const desktopRepo = new FakeDesktopSyncRepository();
  const telemetryRepo = new FakeTelemetryRepository();
  const now = new Date("2026-07-20T00:00:00Z");

  await assert.rejects(
    () =>
      ingestTelemetry(
        desktopRepo,
        telemetryRepo,
        { deviceId: "ghost-device", events: [usageEvent(now)] },
        "dk_whatever_notarealkeyvaluebutformattedplausiblyxxxx",
        now,
      ),
    (err: unknown) => err instanceof TelemetryError && err.code === "device_not_found",
  );
});

test("ingestTelemetry surfaces batch validation errors and stores nothing", async () => {
  const desktopRepo = new FakeDesktopSyncRepository();
  const telemetryRepo = new FakeTelemetryRepository();
  const { device, apiKey } = await enrolledDevice(desktopRepo);

  await assert.rejects(
    () =>
      ingestTelemetry(
        desktopRepo,
        telemetryRepo,
        { deviceId: device.id, events: [] },
        apiKey,
      ),
    (err: unknown) => err instanceof TelemetryError && err.code === "empty_batch",
  );
  assert.equal(telemetryRepo.events.length, 0);
});

test("ingestTelemetry authenticates before validating the batch (auth failure takes priority)", async () => {
  const desktopRepo = new FakeDesktopSyncRepository();
  const telemetryRepo = new FakeTelemetryRepository();
  const { device } = await enrolledDevice(desktopRepo);

  // Both a bad key AND an empty batch -- should fail on auth, not validation.
  await assert.rejects(
    () =>
      ingestTelemetry(
        desktopRepo,
        telemetryRepo,
        { deviceId: device.id, events: [] },
        "dk_wrongkey_totallynotvalidkeyvaluehereatall12345",
      ),
    (err: unknown) => err instanceof TelemetryError && err.code === "unauthorized",
  );
});
