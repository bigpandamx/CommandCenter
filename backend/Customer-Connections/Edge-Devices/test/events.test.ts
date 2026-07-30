import { test } from "node:test";
import assert from "node:assert/strict";
import { registerEdgeDevice } from "../src/registration.js";
import { ingestEdgeDeviceEvents, EdgeDeviceEventError } from "../src/events.js";
import { signalPendingSync } from "../src/healthSync.js";
import { FakeEdgeDevicesRepository } from "./fakeRepository.js";
import type { EdgeDeviceEventInput } from "../src/types.js";

async function registered(repo: FakeEdgeDevicesRepository) {
  return registerEdgeDevice(repo, { organizationId: "org-1", name: "GW", deploymentType: "hybrid" });
}

test("ingestEdgeDeviceEvents accepts a batch of new events", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  const events: EdgeDeviceEventInput[] = [
    { eventId: "evt-1", eventType: "prompt_allowed" },
    { eventId: "evt-2", eventType: "prompt_blocked", severity: "warning", payload: { rule: "pii-block" } },
  ];

  const summary = await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, events);

  assert.deepEqual(summary, { accepted: 2, duplicate: 0, invalid: 0 });
  assert.equal(repo.events.size, 2);
});

test("ingestEdgeDeviceEvents treats a repeated eventId as a duplicate, not an error", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);

  await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [{ eventId: "evt-1", eventType: "heartbeat" }]);
  const summary = await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-1", eventType: "heartbeat" }, // same id, e.g. a retried batch after a dropped connection
    { eventId: "evt-2", eventType: "heartbeat" },
  ]);

  assert.deepEqual(summary, { accepted: 1, duplicate: 1, invalid: 0 });
  assert.equal(repo.events.size, 2, "the duplicate must not have been re-stored");
});

test("ingestEdgeDeviceEvents rejects an empty batch", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  await assert.rejects(
    () => ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, []),
    (err: unknown) => err instanceof EdgeDeviceEventError && err.code === "empty_batch",
  );
});

test("ingestEdgeDeviceEvents rejects a batch over 500 events", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  const events: EdgeDeviceEventInput[] = Array.from({ length: 501 }, (_, i) => ({
    eventId: `evt-${i}`,
    eventType: "heartbeat" as const,
  }));
  await assert.rejects(
    () => ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, events),
    (err: unknown) => err instanceof EdgeDeviceEventError && err.code === "batch_too_large",
  );
});

test("ingestEdgeDeviceEvents rejects a bad API key and stores nothing", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  await assert.rejects(() =>
    ingestEdgeDeviceEvents(repo, reg.deviceId, "agt_wrongkey", [{ eventId: "evt-1", eventType: "heartbeat" }]),
  );
  assert.equal(repo.events.size, 0);
});

test("ingestEdgeDeviceEvents degrades an unparseable occurredAt to null rather than rejecting the event", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-1", eventType: "error", occurredAt: "not-a-real-timestamp" },
  ]);
  const stored = await repo.getEventByEventId("evt-1");
  assert.equal(stored?.occurredAt, null);
});

test("ingestEdgeDeviceEvents tags events with the authenticated device's org, not a caller-supplied one", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [{ eventId: "evt-1", eventType: "heartbeat" }]);
  const stored = await repo.getEventByEventId("evt-1");
  assert.equal(stored?.organizationId, "org-1");
});

test("ingestEdgeDeviceEvents clears pendingSync and records the version when a policy_sync_ack event arrives -- the real gap this closes", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  await signalPendingSync(repo, "org-1", "policy updated");

  const before = await repo.getDeviceById(reg.deviceId);
  assert.equal(before?.pendingSync, true, "sanity check");

  await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-ack-1", eventType: "policy_sync_ack", payload: { policySnapshotVersion: "policy-v42" } },
  ]);

  const after = await repo.getDeviceById(reg.deviceId);
  assert.equal(after?.pendingSync, false);
  assert.equal(after?.pendingSyncReason, null);
  assert.equal(after?.policySnapshotVersion, "policy-v42");
});

test("ingestEdgeDeviceEvents still stores the policy_sync_ack event itself as a normal audit row", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);

  const summary = await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-ack-1", eventType: "policy_sync_ack", payload: { policySnapshotVersion: "policy-v1" } },
  ]);

  assert.equal(summary.accepted, 1);
  const stored = await repo.getEventByEventId("evt-ack-1");
  assert.equal(stored?.eventType, "policy_sync_ack");
});

test("ingestEdgeDeviceEvents does not change device state when a policy_sync_ack event has no policySnapshotVersion in its payload", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);
  await signalPendingSync(repo, "org-1", "policy updated");

  await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-ack-1", eventType: "policy_sync_ack" }, // no payload at all
  ]);

  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.pendingSync, true, "pendingSync should be untouched without a version to record");
  assert.equal(stored?.policySnapshotVersion, null);
});

test("ingestEdgeDeviceEvents applies the LAST policy_sync_ack when multiple appear in one batch", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);

  await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-ack-1", eventType: "policy_sync_ack", payload: { policySnapshotVersion: "policy-v1" } },
    { eventId: "evt-ack-2", eventType: "policy_sync_ack", payload: { policySnapshotVersion: "policy-v2" } },
  ]);

  const stored = await repo.getDeviceById(reg.deviceId);
  assert.equal(stored?.policySnapshotVersion, "policy-v2");
});

test("ingestEdgeDeviceEvents ignores a duplicate policy_sync_ack event (same eventId) without reapplying state -- idempotency applies here too", async () => {
  const repo = new FakeEdgeDevicesRepository();
  const reg = await registered(repo);

  await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-ack-1", eventType: "policy_sync_ack", payload: { policySnapshotVersion: "policy-v1" } },
  ]);
  // Retry the same batch (e.g. after a dropped connection) -- the event
  // is a duplicate and should be skipped, same as any other event type.
  const summary = await ingestEdgeDeviceEvents(repo, reg.deviceId, reg.apiKey, [
    { eventId: "evt-ack-1", eventType: "policy_sync_ack", payload: { policySnapshotVersion: "policy-v1" } },
  ]);

  assert.equal(summary.duplicate, 1);
  assert.equal(summary.accepted, 0);
});
