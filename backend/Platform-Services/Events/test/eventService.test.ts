import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { publishEvent, listEvents } from "../src/eventService.js";
import { EventError } from "../src/types.js";
import { FakeEventsRepository } from "./fakeEventsRepository.js";

function baseInput(overrides: Partial<Parameters<typeof publishEvent>[1]> = {}) {
  return {
    eventId: randomUUID(),
    type: "organization.activated",
    source: "aegis",
    occurredAt: new Date(),
    payload: { organizationId: "org-1" },
    ...overrides,
  };
}

test("publishEvent records a new event", async () => {
  const repo = new FakeEventsRepository();
  const event = await publishEvent(repo, baseInput());
  assert.equal(event.type, "organization.activated");
  assert.equal(event.source, "aegis");
  assert.deepEqual(event.payload, { organizationId: "org-1" });
});

test("publishEvent is idempotent on eventId -- a retried delivery doesn't create a duplicate", async () => {
  const repo = new FakeEventsRepository();
  const input = baseInput();

  const first = await publishEvent(repo, input);
  const second = await publishEvent(repo, input);

  assert.equal(first.id, second.id);
  assert.equal(repo.events.size, 1);
});

test("publishEvent rejects a missing eventId", async () => {
  const repo = new FakeEventsRepository();
  await assert.rejects(
    () => publishEvent(repo, baseInput({ eventId: "" })),
    (err: unknown) => err instanceof EventError && err.code === "invalid_event_id",
  );
});

test("publishEvent rejects an invalid type format", async () => {
  const repo = new FakeEventsRepository();
  await assert.rejects(
    () => publishEvent(repo, baseInput({ type: "Not Valid!" })),
    (err: unknown) => err instanceof EventError && err.code === "invalid_type",
  );
});

test("publishEvent accepts a dot-namespaced type", async () => {
  const repo = new FakeEventsRepository();
  const event = await publishEvent(repo, baseInput({ type: "billing.subscription_changed" }));
  assert.equal(event.type, "billing.subscription_changed");
});

test("publishEvent rejects a missing source", async () => {
  const repo = new FakeEventsRepository();
  await assert.rejects(
    () => publishEvent(repo, baseInput({ source: "" })),
    (err: unknown) => err instanceof EventError && err.code === "invalid_source",
  );
});

test("listEvents returns events in receivedAt order", async () => {
  const repo = new FakeEventsRepository();
  await publishEvent(repo, baseInput({ eventId: randomUUID(), type: "a.one" }));
  await publishEvent(repo, baseInput({ eventId: randomUUID(), type: "a.two" }));
  const events = await listEvents(repo);
  assert.equal(events.length, 2);
  assert.equal(events[0]!.type, "a.one");
  assert.equal(events[1]!.type, "a.two");
});

test("listEvents filters by afterSequence cursor", async () => {
  const repo = new FakeEventsRepository();
  const first = await publishEvent(repo, baseInput({ eventId: randomUUID() }));
  const second = await publishEvent(repo, baseInput({ eventId: randomUUID() }));

  const afterFirst = await listEvents(repo, { afterSequence: first.sequence });
  assert.equal(afterFirst.length, 1);
  assert.equal(afterFirst[0]!.id, second.id);
});

test("listEvents cursor is robust even when events are published in the same millisecond", async () => {
  // The bug this guards against: receivedAt (a JS Date, millisecond
  // resolution) can genuinely tie between two fast back-to-back
  // publishes -- a cursor built on that could silently drop the second
  // event from a "since my last cursor" query forever. sequence can't
  // tie, regardless of how close together the two calls happen.
  const repo = new FakeEventsRepository();
  const first = await publishEvent(repo, baseInput({ eventId: randomUUID() }));
  const second = await publishEvent(
    repo,
    baseInput({ eventId: randomUUID(), occurredAt: first.occurredAt }), // force identical timestamps
  );

  const afterFirst = await listEvents(repo, { afterSequence: first.sequence });
  assert.equal(afterFirst.length, 1);
  assert.equal(afterFirst[0]!.id, second.id);
});

test("listEvents filters by type", async () => {
  const repo = new FakeEventsRepository();
  await publishEvent(repo, baseInput({ eventId: randomUUID(), type: "a.one" }));
  await publishEvent(repo, baseInput({ eventId: randomUUID(), type: "b.two" }));

  const filtered = await listEvents(repo, { type: "a.one" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]!.type, "a.one");
});

test("listEvents respects limit", async () => {
  const repo = new FakeEventsRepository();
  for (let i = 0; i < 5; i++) {
    await publishEvent(repo, baseInput({ eventId: randomUUID() }));
  }
  const limited = await listEvents(repo, { limit: 2 });
  assert.equal(limited.length, 2);
});
