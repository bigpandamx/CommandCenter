import type { EventsRepository } from "../src/repository.js";
import type { Event } from "../src/types.js";

export class FakeEventsRepository implements EventsRepository {
  events = new Map<string, Event>(); // keyed by eventId
  private nextSequence = 1;

  async createEvent(event: Omit<Event, "sequence">): Promise<Event> {
    const full: Event = { ...event, sequence: this.nextSequence++ };
    this.events.set(full.eventId, full);
    return full;
  }

  async getEventByEventId(eventId: string) {
    return this.events.get(eventId) ?? null;
  }

  async listEventsSince(opts?: { afterSequence?: number; type?: string; limit?: number }) {
    let all = [...this.events.values()].sort((a, b) => a.sequence - b.sequence);
    if (opts?.afterSequence !== undefined) {
      const after = opts.afterSequence;
      all = all.filter((e) => e.sequence > after);
    }
    if (opts?.type) {
      all = all.filter((e) => e.type === opts.type);
    }
    if (opts?.limit) {
      all = all.slice(0, opts.limit);
    }
    return all;
  }
}
