import type { Event } from "./types.js";

export interface EventsRepository {
  createEvent(event: Omit<Event, "sequence">): Promise<Event>;
  getEventByEventId(eventId: string): Promise<Event | null>;
  /** Ordered by sequence ascending -- the natural order for a subscriber replaying "everything after my last cursor." */
  listEventsSince(opts?: { afterSequence?: number; type?: string; limit?: number }): Promise<Event[]>;
}
