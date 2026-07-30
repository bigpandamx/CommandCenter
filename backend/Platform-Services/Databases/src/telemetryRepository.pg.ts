/**
 * Postgres implementation of Customer-Connections/Desktop-Apps's
 * TelemetryRepository port. Same offline caveat as the other *.pg.ts files
 * here: type-checked against pg's documented API, not executed against a
 * live database in this session.
 */
import type { Pool } from "pg";
import type { TelemetryRepository } from "../../../Customer-Connections/Desktop-Apps/src/telemetryRepository.js";
import type { TelemetryEvent } from "../../../Customer-Connections/Desktop-Apps/src/types.js";

export class PgTelemetryRepository implements TelemetryRepository {
  constructor(private readonly pool: Pool) {}

  async appendEvents(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    // Batched multi-row insert rather than one query per event -- a device
    // can send up to 500 events per call (see telemetry.ts's
    // MAX_EVENTS_PER_BATCH), and 500 round trips per check-in would be a
    // needless bottleneck.
    const values: unknown[] = [];
    const rowPlaceholders: string[] = [];
    events.forEach((event, i) => {
      const base = i * 6;
      rowPlaceholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
      );
      values.push(
        event.id,
        event.deviceId,
        event.organizationId,
        event.type,
        JSON.stringify(event.payload),
        event.occurredAt,
      );
    });

    await this.pool.query(
      `INSERT INTO telemetry_events (id, device_id, organization_id, type, payload, occurred_at)
       VALUES ${rowPlaceholders.join(", ")}`,
      values,
    );
  }

  async listEventsForOrg(
    organizationId: string,
    opts?: { since?: Date; limit?: number },
  ): Promise<TelemetryEvent[]> {
    const conditions = ["organization_id = $1"];
    const params: unknown[] = [organizationId];

    if (opts?.since) {
      params.push(opts.since);
      conditions.push(`received_at >= $${params.length}`);
    }

    const limit = opts?.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT id, device_id, organization_id, type, payload, occurred_at, received_at
         FROM telemetry_events
        WHERE ${conditions.join(" AND ")}
        ORDER BY received_at DESC
        LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapEvent);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(row: any): TelemetryEvent {
  return {
    id: row.id,
    deviceId: row.device_id,
    organizationId: row.organization_id,
    type: row.type,
    payload: row.payload,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
  };
}
