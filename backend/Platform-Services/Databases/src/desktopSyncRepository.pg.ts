/**
 * Postgres implementation of Customer-Connections/Desktop-Apps's
 * DesktopSyncRepository port. This is the ONLY place in the codebase that
 * should hold SQL for the desktop-sync domain -- keep it that way so a
 * missing organization_id filter is easy to audit for in one file.
 *
 * NOTE: This file depends on the `pg` package (not installed in the sandbox
 * this was authored in, which has no network access). It has been
 * type-checked against `pg`'s documented API shape but not executed against
 * a live database. Run `npm install` and the test suite in
 * Platform-Services/Databases/test/ against a real Postgres instance (or
 * testcontainers) before relying on it in production. This is a documented
 * limitation, not a silent one.
 */
import type { Pool, PoolClient } from "pg";
import type { DesktopSyncRepository } from "../../../Customer-Connections/Desktop-Apps/src/repository.js";
import type {
  Device,
  EnrollmentToken,
  Organization,
  PendingCommand,
  UpdateManifestEntry,
} from "../../../Customer-Connections/Desktop-Apps/src/types.js";

export class PgDesktopSyncRepository implements DesktopSyncRepository {
  constructor(private readonly pool: Pool) {}

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const { rows } = await this.pool.query(
      `SELECT id, name, entitlement_tier, created_at
         FROM organizations
        WHERE id = $1`,
      [organizationId],
    );
    return rows[0] ? mapOrganization(rows[0]) : null;
  }

  async getEnrollmentToken(token: string): Promise<EnrollmentToken | null> {
    const { rows } = await this.pool.query(
      `SELECT token, organization_id, created_at, expires_at, consumed_at, max_uses, use_count
         FROM enrollment_tokens
        WHERE token = $1`,
      [token],
    );
    return rows[0] ? mapEnrollmentToken(rows[0]) : null;
  }

  async consumeEnrollmentToken(token: string): Promise<void> {
    await this.pool.query(
      `UPDATE enrollment_tokens
          SET use_count = use_count + 1,
              consumed_at = CASE WHEN consumed_at IS NULL THEN now() ELSE consumed_at END
        WHERE token = $1`,
      [token],
    );
  }

  async createDevice(device: Device): Promise<void> {
    // Upsert on (organization_id, fingerprint) so re-enrollment of the same
    // machine rotates in place rather than violating the unique constraint --
    // matches enrollDevice()'s "find existing by fingerprint" logic upstream.
    await this.pool.query(
      `INSERT INTO devices
         (id, organization_id, api_key_hash, fingerprint, display_name, platform,
          app_version, channel, status, enrolled_at, last_checkin_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (organization_id, fingerprint) DO UPDATE
         SET api_key_hash = EXCLUDED.api_key_hash,
             display_name = EXCLUDED.display_name,
             platform = EXCLUDED.platform,
             app_version = EXCLUDED.app_version,
             status = 'active'`,
      [
        device.id,
        device.organizationId,
        device.apiKeyHash,
        device.fingerprint,
        device.displayName,
        device.platform,
        device.appVersion,
        device.channel,
        device.status,
        device.enrolledAt,
        device.lastCheckinAt,
      ],
    );
  }

  async getDeviceById(deviceId: string): Promise<Device | null> {
    const { rows } = await this.pool.query(
      `SELECT id, organization_id, api_key_hash, fingerprint, display_name, platform,
              app_version, channel, status, enrolled_at, last_checkin_at
         FROM devices
        WHERE id = $1`,
      [deviceId],
    );
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async getDeviceByFingerprint(
    organizationId: string,
    fingerprint: string,
  ): Promise<Device | null> {
    const { rows } = await this.pool.query(
      `SELECT id, organization_id, api_key_hash, fingerprint, display_name, platform,
              app_version, channel, status, enrolled_at, last_checkin_at
         FROM devices
        WHERE organization_id = $1 AND fingerprint = $2`,
      [organizationId, fingerprint],
    );
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async updateDeviceCheckin(
    deviceId: string,
    appVersion: string,
    checkinAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE devices
          SET app_version = $2,
              last_checkin_at = $3
        WHERE id = $1`,
      [deviceId, appVersion, checkinAt],
    );
  }

  async countActiveDevicesForOrg(organizationId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count
         FROM devices
        WHERE organization_id = $1 AND status = 'active'`,
      [organizationId],
    );
    return rows[0]?.count ?? 0;
  }

  async getPendingCommands(deviceId: string): Promise<PendingCommand[]> {
    // Deliberately does NOT filter by organization_id -- deviceId is already
    // a UUID scoped 1:1 to a single org via the devices table, and the
    // caller (checkin.ts) has already authenticated the device. If this
    // query is ever reused from a route that takes an org-supplied deviceId
    // without prior device-key authentication, add an explicit org_id join.
    const { rows } = await this.pool.query(
      `SELECT id, type, issued_at, payload
         FROM pending_commands
        WHERE device_id = $1 AND delivered_at IS NULL
        ORDER BY issued_at ASC`,
      [deviceId],
    );
    return rows.map(mapPendingCommand);
  }

  async clearPendingCommands(deviceId: string, commandIds: string[]): Promise<void> {
    if (commandIds.length === 0) return;
    await this.pool.query(
      `UPDATE pending_commands
          SET delivered_at = now()
        WHERE device_id = $1 AND id = ANY($2::uuid[])`,
      [deviceId, commandIds],
    );
  }

  async getLatestManifest(
    channel: Device["channel"],
    platform: Device["platform"],
  ): Promise<UpdateManifestEntry | null> {
    const { rows } = await this.pool.query(
      `SELECT version, channel, platform, published_at, download_url, sha256, min_upgrade_from
         FROM update_manifests
        WHERE channel = $1 AND platform = $2
        ORDER BY published_at DESC
        LIMIT 1`,
      [channel, platform],
    );
    return rows[0] ? mapManifest(rows[0]) : null;
  }
}

/** Run a series of repository operations inside a single transaction. Useful for callers (e.g. enroll) that must not partially apply. */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- row mappers -----------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- row shape comes from `pg`, which types query results as `any`
function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    entitlementTier: row.entitlement_tier,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEnrollmentToken(row: any): EnrollmentToken {
  return {
    token: row.token,
    organizationId: row.organization_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDevice(row: any): Device {
  return {
    id: row.id,
    organizationId: row.organization_id,
    apiKeyHash: row.api_key_hash,
    fingerprint: row.fingerprint,
    displayName: row.display_name,
    platform: row.platform,
    appVersion: row.app_version,
    channel: row.channel,
    status: row.status,
    enrolledAt: row.enrolled_at,
    lastCheckinAt: row.last_checkin_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPendingCommand(row: any): PendingCommand {
  return {
    id: row.id,
    type: row.type,
    issuedAt: row.issued_at,
    payload: row.payload ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapManifest(row: any): UpdateManifestEntry {
  return {
    version: row.version,
    channel: row.channel,
    platform: row.platform,
    publishedAt: row.published_at,
    downloadUrl: row.download_url,
    sha256: row.sha256,
    minUpgradeFrom: row.min_upgrade_from,
  };
}
