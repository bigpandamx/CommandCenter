/**
 * Postgres implementation of Control-Plane/FleetOperations'
 * FleetOperationsRepository port. Same offline caveat as the other
 * *.pg.ts files in this folder: type-checked against pg's documented
 * API, not executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { FleetOperationsRepository } from "../../../Control-Plane/FleetOperations/src/repository.js";
import type { FleetHeartbeat } from "../../../Control-Plane/FleetOperations/src/types.js";

export class PgFleetOperationsRepository implements FleetOperationsRepository {
  constructor(private readonly pool: Pool) {}

  async appendHeartbeat(heartbeat: FleetHeartbeat): Promise<void> {
    await this.pool.query(
      `INSERT INTO fleet_heartbeats
         (id, organization_id, version, installed_modules, license_state, health_score,
          failed_job_count, pending_migration_count, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        heartbeat.id,
        heartbeat.organizationId,
        heartbeat.version,
        heartbeat.installedModules,
        heartbeat.licenseState,
        heartbeat.healthScore,
        heartbeat.failedJobCount,
        heartbeat.pendingMigrationCount,
        heartbeat.receivedAt,
      ],
    );
  }

  async listLatestHeartbeats(): Promise<FleetHeartbeat[]> {
    // DISTINCT ON (organization_id), ordered (organization_id,
    // received_at DESC) -- Postgres's idiomatic "one row per group,
    // the most recent" pattern, satisfied directly by this table's own
    // composite index (see the migration's own comment) rather than a
    // window function or a self-join.
    const { rows } = await this.pool.query(
      `SELECT DISTINCT ON (organization_id) *
       FROM fleet_heartbeats
       ORDER BY organization_id, received_at DESC`,
    );
    return rows.map(mapHeartbeat);
  }

  async getLatestHeartbeatForOrg(organizationId: string): Promise<FleetHeartbeat | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM fleet_heartbeats WHERE organization_id = $1 ORDER BY received_at DESC LIMIT 1`,
      [organizationId],
    );
    return rows[0] ? mapHeartbeat(rows[0]) : null;
  }

  async listHeartbeatHistoryForOrg(organizationId: string, opts?: { limit?: number }): Promise<FleetHeartbeat[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM fleet_heartbeats WHERE organization_id = $1 ORDER BY received_at DESC LIMIT $2`,
      [organizationId, limit],
    );
    return rows.map(mapHeartbeat);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHeartbeat(row: any): FleetHeartbeat {
  return {
    id: row.id,
    organizationId: row.organization_id,
    version: row.version,
    installedModules: row.installed_modules,
    licenseState: row.license_state,
    healthScore: Number(row.health_score),
    failedJobCount: Number(row.failed_job_count),
    pendingMigrationCount: Number(row.pending_migration_count),
    receivedAt: row.received_at,
  };
}
