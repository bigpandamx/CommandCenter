/**
 * Event envelope. `type` is deliberately a free-form string, not a
 * compile-time enum -- Command Center shouldn't need a code change just
 * to accept a new event type from a publisher; that's exactly the
 * decoupling this module exists for. Convention (documented in
 * EVENTS.md, not enforced here): dot-namespaced, past-tense,
 * e.g. "organization.activated". Namespace by the concept the event is
 * about, not by which service published it -- `source` already carries
 * that.
 */
export interface Event {
  /** Command Center's own row id. */
  id: string;
  /**
   * Strictly monotonic insert order -- the actual pagination cursor.
   * Not receivedAt: even at database timestamp precision, two fast
   * concurrent inserts can tie, which would let a subscriber's "since
   * my last cursor" query silently skip an event forever. sequence
   * can't tie.
   */
  sequence: number;
  /** The publisher's own idempotency key, generated before the event is ever sent. Unique -- see publishEvent's idempotency handling. */
  eventId: string;
  type: string;
  source: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  /** When Command Center actually recorded it -- distinct from occurredAt, which is when the publisher says it happened (may be earlier, e.g. after a retried delivery). Informational only; not the pagination cursor (see sequence). */
  receivedAt: Date;
}

export interface PublishEventInput {
  eventId: string;
  type: string;
  source: string;
  occurredAt: Date;
  payload?: Record<string, unknown>;
}

export class EventError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_event_id" | "invalid_type" | "invalid_source",
  ) {
    super(message);
    this.name = "EventError";
  }
}
