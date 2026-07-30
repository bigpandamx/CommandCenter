/**
 * Postgres implementation of Platform-Services/Events's EventsRepository
 * port. Same offline caveat as the other *.pg.ts files: type-checked
 * against pg's documented API, not executed against a live database in
 * this session.
 */
import type { Pool } from "pg";
import type { EventsRepository } from "../../Events/src/repository.js";
import type { Event } from "../../Events/src/types.js";

export class PgEventsRepository implements EventsRepository {
  constructor(private readonly pool: Pool) {}

  async createEvent(event: Omit<Event, "sequence">): Promise<Event> {
    const { rows } = await this.pool.query(
      `INSERT INTO events (id, event_id, type, source, occurred_at, payload, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [event.id, event.eventId, event.type, event.source, event.occurredAt, JSON.stringify(event.payload), event.receivedAt],
    );
    return mapEvent(rows[0]);
  }

  async getEventByEventId(eventId: string): Promise<Event | null> {
    const { rows } = await this.pool.query(`SELECT * FROM events WHERE event_id = $1`, [eventId]);
    return rows[0] ? mapEvent(rows[0]) : null;
  }

  async listEventsSince(opts?: { afterSequence?: number; type?: string; limit?: number }): Promise<Event[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.afterSequence !== undefined) {
      params.push(opts.afterSequence);
      conditions.push(`sequence > $${params.length}`);
    }
    if (opts?.type) {
      params.push(opts.type);
      conditions.push(`type = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = opts?.limit ? `LIMIT ${Number(opts.limit)}` : "";

    const { rows } = await this.pool.query(
      `SELECT * FROM events ${where} ORDER BY sequence ASC ${limitClause}`,
      params,
    );
    return rows.map(mapEvent);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(row: any): Event {
  return {
    id: row.id,
    sequence: Number(row.sequence),
    eventId: row.event_id,
    type: row.type,
    source: row.source,
    occurredAt: row.occurred_at,
    payload: row.payload,
    receivedAt: row.received_at,
  };
}
