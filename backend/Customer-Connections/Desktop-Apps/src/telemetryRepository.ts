import type { TelemetryEvent } from "./types.js";

export interface TelemetryRepository {
  appendEvents(events: TelemetryEvent[]): Promise<void>;
  /** For admin/reporting use. Always organization_id scoped -- see the tenant-isolation note on the SQL migration. */
  listEventsForOrg(
    organizationId: string,
    opts?: { since?: Date; limit?: number },
  ): Promise<TelemetryEvent[]>;
}
