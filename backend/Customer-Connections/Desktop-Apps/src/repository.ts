import type {
  Device,
  EnrollmentToken,
  Organization,
  PendingCommand,
  UpdateManifestEntry,
} from "./types.js";

/**
 * Port (in the hexagonal-architecture sense) that the desktop-sync domain
 * logic depends on. Platform-Services/Databases provides the real Postgres
 * implementation; tests use an in-memory fake. Nothing in this folder should
 * import `pg`, Prisma, or any driver directly.
 */
export interface DesktopSyncRepository {
  getOrganization(organizationId: string): Promise<Organization | null>;

  getEnrollmentToken(token: string): Promise<EnrollmentToken | null>;
  consumeEnrollmentToken(token: string): Promise<void>;

  createDevice(device: Device): Promise<void>;
  getDeviceById(deviceId: string): Promise<Device | null>;
  getDeviceByFingerprint(
    organizationId: string,
    fingerprint: string,
  ): Promise<Device | null>;
  updateDeviceCheckin(
    deviceId: string,
    appVersion: string,
    checkinAt: Date,
  ): Promise<void>;
  /** Active devices only (excludes revoked/suspended) -- used by Licensing to enforce per-tier device caps. */
  countActiveDevicesForOrg(organizationId: string): Promise<number>;

  getPendingCommands(deviceId: string): Promise<PendingCommand[]>;
  clearPendingCommands(deviceId: string, commandIds: string[]): Promise<void>;

  getLatestManifest(
    channel: Device["channel"],
    platform: Device["platform"],
  ): Promise<UpdateManifestEntry | null>;
}
