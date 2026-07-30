import type { FleetHeartbeat } from "./types.js";

export interface FleetOperationsRepository {
  appendHeartbeat(heartbeat: FleetHeartbeat): Promise<void>;
  /** One row per organization -- the most recent heartbeat for each org that has ever reported in. This is the live fleet dashboard's actual query, not something built by fetching everything and filtering in application code. */
  listLatestHeartbeats(): Promise<FleetHeartbeat[]>;
  getLatestHeartbeatForOrg(organizationId: string): Promise<FleetHeartbeat | null>;
  /** Full history for one org, most recent first -- what a staff member drills into from the fleet dashboard to see a specific org's health trend, not the default view. */
  listHeartbeatHistoryForOrg(organizationId: string, opts?: { limit?: number }): Promise<FleetHeartbeat[]>;
}
