/**
 * Postgres implementation of Customer-Connections/Edge-Devices's
 * EdgeDevicesRepository port. Same offline caveat as the other *.pg.ts
 * files in this folder: type-checked against pg's documented API, not
 * executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { EdgeDevicesRepository } from "../../../Customer-Connections/Edge-Devices/src/repository.js";
import type { EdgeDevice, EdgeDeviceEvent } from "../../../Customer-Connections/Edge-Devices/src/types.js";

export class PgEdgeDevicesRepository implements EdgeDevicesRepository {
  constructor(private readonly pool: Pool) {}

  async createDevice(device: EdgeDevice): Promise<void> {
    await this.pool.query(
      `INSERT INTO edge_devices
         (id, organization_id, name, description, deployment_type, environment, version,
          api_key_hash, api_key_prefix, status, last_heartbeat, policy_snapshot_version,
          last_policy_sync, pending_sync, pending_sync_reason, ip_allowlist, is_active,
          metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        device.id,
        device.organizationId,
        device.name,
        device.description,
        device.deploymentType,
        device.environment,
        device.version,
        device.apiKeyHash,
        device.apiKeyPrefix,
        device.status,
        device.lastHeartbeat,
        device.policySnapshotVersion,
        device.lastPolicySync,
        device.pendingSync,
        device.pendingSyncReason,
        device.ipAllowlist,
        device.isActive,
        device.metadata ? JSON.stringify(device.metadata) : null,
        device.createdAt,
        device.updatedAt,
      ],
    );
  }

  async getDeviceById(deviceId: string): Promise<EdgeDevice | null> {
    const { rows } = await this.pool.query(`SELECT * FROM edge_devices WHERE id = $1`, [deviceId]);
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async listDevicesForOrg(organizationId: string): Promise<EdgeDevice[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM edge_devices WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId],
    );
    return rows.map(mapDevice);
  }

  async updateDevice(device: EdgeDevice): Promise<void> {
    await this.pool.query(
      `UPDATE edge_devices SET
         name = $2, description = $3, environment = $4, version = $5,
         api_key_hash = $6, api_key_prefix = $7, status = $8, last_heartbeat = $9,
         policy_snapshot_version = $10, last_policy_sync = $11, pending_sync = $12,
         pending_sync_reason = $13, ip_allowlist = $14, is_active = $15, metadata = $16,
         updated_at = $17
       WHERE id = $1`,
      [
        device.id,
        device.name,
        device.description,
        device.environment,
        device.version,
        device.apiKeyHash,
        device.apiKeyPrefix,
        device.status,
        device.lastHeartbeat,
        device.policySnapshotVersion,
        device.lastPolicySync,
        device.pendingSync,
        device.pendingSyncReason,
        device.ipAllowlist,
        device.isActive,
        device.metadata ? JSON.stringify(device.metadata) : null,
        device.updatedAt,
      ],
    );
  }

  async deactivateDevice(deviceId: string): Promise<void> {
    await this.pool.query(
      `UPDATE edge_devices SET is_active = false, status = 'inactive', updated_at = now() WHERE id = $1`,
      [deviceId],
    );
  }

  async getEventByEventId(eventId: string): Promise<EdgeDeviceEvent | null> {
    const { rows } = await this.pool.query(`SELECT * FROM edge_device_events WHERE event_id = $1`, [eventId]);
    return rows[0] ? mapEvent(rows[0]) : null;
  }

  async appendEvent(event: EdgeDeviceEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO edge_device_events
         (id, edge_device_id, organization_id, event_id, event_type, severity, payload, occurred_at, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        event.id,
        event.edgeDeviceId,
        event.organizationId,
        event.eventId,
        event.eventType,
        event.severity,
        event.payload ? JSON.stringify(event.payload) : null,
        event.occurredAt,
        event.receivedAt,
      ],
    );
  }

  async listEventsForDevice(
    deviceId: string,
    opts?: { eventType?: EdgeDeviceEvent["eventType"]; limit?: number },
  ): Promise<EdgeDeviceEvent[]> {
    const conditions = ["edge_device_id = $1"];
    const params: unknown[] = [deviceId];
    if (opts?.eventType) {
      params.push(opts.eventType);
      conditions.push(`event_type = $${params.length}`);
    }
    const limit = opts?.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM edge_device_events WHERE ${conditions.join(" AND ")} ORDER BY received_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapEvent);
  }

  async sweepStaleDevices(
    degradedThreshold: Date,
    offlineThreshold: Date,
  ): Promise<{ markedDegraded: number; markedOffline: number }> {
    // Bulk UPDATEs, not a fetch-all + loop -- mirrors Aegis's original
    // sweep_offline_agents for the same reason: a large fleet shouldn't
    // mean loading every row into memory every sweep interval.
    const offlineResult = await this.pool.query(
      `UPDATE edge_devices
          SET status = 'offline'
        WHERE status IN ('active', 'degraded')
          AND last_heartbeat < $1
          AND is_active = true`,
      [offlineThreshold],
    );
    const degradedResult = await this.pool.query(
      `UPDATE edge_devices
          SET status = 'degraded'
        WHERE status = 'active'
          AND last_heartbeat < $1
          AND last_heartbeat >= $2
          AND is_active = true`,
      [degradedThreshold, offlineThreshold],
    );
    return {
      markedOffline: offlineResult.rowCount ?? 0,
      markedDegraded: degradedResult.rowCount ?? 0,
    };
  }

  async flagPendingSyncForOrg(organizationId: string, reason: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE edge_devices
          SET pending_sync = true, pending_sync_reason = $2
        WHERE organization_id = $1 AND is_active = true AND status != 'offline'`,
      [organizationId, reason],
    );
    return result.rowCount ?? 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDevice(row: any): EdgeDevice {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    deploymentType: row.deployment_type,
    environment: row.environment,
    version: row.version,
    apiKeyHash: row.api_key_hash,
    apiKeyPrefix: row.api_key_prefix,
    status: row.status,
    lastHeartbeat: row.last_heartbeat,
    policySnapshotVersion: row.policy_snapshot_version,
    lastPolicySync: row.last_policy_sync,
    pendingSync: row.pending_sync,
    pendingSyncReason: row.pending_sync_reason,
    ipAllowlist: row.ip_allowlist,
    isActive: row.is_active,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(row: any): EdgeDeviceEvent {
  return {
    id: row.id,
    edgeDeviceId: row.edge_device_id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    eventType: row.event_type,
    severity: row.severity,
    payload: row.payload,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
  };
}
