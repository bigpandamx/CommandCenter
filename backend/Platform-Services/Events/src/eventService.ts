import { randomUUID } from "node:crypto";
import type { EventsRepository } from "./repository.js";
import { EventError, type Event, type PublishEventInput } from "./types.js";

const TYPE_PATTERN = /^[a-z0-9]+(\.[a-z0-9_]+)*$/;

/**
 * Publishes an event. Idempotent on eventId: if this exact event was
 * already recorded (a retried delivery whose earlier response got lost
 * to a network blip, not a genuinely new occurrence), this returns the
 * existing row rather than recording a duplicate -- a subscriber
 * replaying events from a cursor should never see the same logical
 * event twice just because the publisher's outbox retried a delivery
 * that had actually already succeeded.
 */
export async function publishEvent(repo: EventsRepository, input: PublishEventInput): Promise<Event> {
  if (!input.eventId || input.eventId.trim().length === 0) {
    throw new EventError("eventId is required", "invalid_event_id");
  }
  if (!TYPE_PATTERN.test(input.type)) {
    throw new EventError(
      `Invalid event type "${input.type}" -- must be dot-namespaced lowercase (e.g. "organization.activated")`,
      "invalid_type",
    );
  }
  if (!input.source || input.source.trim().length === 0) {
    throw new EventError("source is required", "invalid_source");
  }

  const existing = await repo.getEventByEventId(input.eventId);
  if (existing) {
    return existing;
  }

  return repo.createEvent({
    id: randomUUID(),
    eventId: input.eventId,
    type: input.type,
    source: input.source,
    occurredAt: input.occurredAt,
    payload: input.payload ?? {},
    receivedAt: new Date(),
  });
}

export async function listEvents(
  repo: EventsRepository,
  opts?: { afterSequence?: number; type?: string; limit?: number },
): Promise<Event[]> {
  return repo.listEventsSince(opts);
}
