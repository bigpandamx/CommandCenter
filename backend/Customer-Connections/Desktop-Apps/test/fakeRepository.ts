import type { DesktopSyncRepository } from "../src/repository.js";
import type { TelemetryRepository } from "../src/telemetryRepository.js";
import type {
  Device,
  EnrollmentToken,
  Organization,
  PendingCommand,
  TelemetryEvent,
  UpdateManifestEntry,
} from "../src/types.js";

/**
 * Minimal in-memory implementation of DesktopSyncRepository for unit tests.
 * Deliberately not exported outside the test folder -- production code must
 * go through Platform-Services/Databases's real Postgres implementation.
 */
export class FakeDesktopSyncRepository implements DesktopSyncRepository {
  organizations = new Map<string, Organization>();
  tokens = new Map<string, EnrollmentToken>();
  devices = new Map<string, Device>();
  devicesByFingerprint = new Map<string, string>(); // `${orgId}:${fingerprint}` -> deviceId
  commands = new Map<string, PendingCommand[]>();
  manifests: UpdateManifestEntry[] = [];

  async getOrganization(organizationId: string) {
    return this.organizations.get(organizationId) ?? null;
  }

  async getEnrollmentToken(token: string) {
    return this.tokens.get(token) ?? null;
  }

  async consumeEnrollmentToken(token: string) {
    const t = this.tokens.get(token);
    if (t) t.useCount += 1;
  }

  async createDevice(device: Device) {
    this.devices.set(device.id, device);
    this.devicesByFingerprint.set(
      `${device.organizationId}:${device.fingerprint}`,
      device.id,
    );
  }

  async getDeviceById(deviceId: string) {
    return this.devices.get(deviceId) ?? null;
  }

  async getDeviceByFingerprint(organizationId: string, fingerprint: string) {
    const id = this.devicesByFingerprint.get(`${organizationId}:${fingerprint}`);
    return id ? this.devices.get(id) ?? null : null;
  }

  async updateDeviceCheckin(deviceId: string, appVersion: string, checkinAt: Date) {
    const d = this.devices.get(deviceId);
    if (d) {
      d.appVersion = appVersion;
      d.lastCheckinAt = checkinAt;
    }
  }

  async countActiveDevicesForOrg(organizationId: string) {
    let count = 0;
    for (const device of this.devices.values()) {
      if (device.organizationId === organizationId && device.status === "active") {
        count += 1;
      }
    }
    return count;
  }

  async getPendingCommands(deviceId: string) {
    return this.commands.get(deviceId) ?? [];
  }

  async clearPendingCommands(deviceId: string, commandIds: string[]) {
    const remaining = (this.commands.get(deviceId) ?? []).filter(
      (c) => !commandIds.includes(c.id),
    );
    this.commands.set(deviceId, remaining);
  }

  async getLatestManifest(channel: Device["channel"], platform: Device["platform"]) {
    const matches = this.manifests
      .filter((m) => m.channel === channel && m.platform === platform)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    return matches[0] ?? null;
  }
}

/**
 * Separate fake -- deliberately not merged into FakeDesktopSyncRepository,
 * since TelemetryRepository is a distinct port in production too (see
 * telemetryRepository.ts's doc comment).
 */
export class FakeTelemetryRepository implements TelemetryRepository {
  events: TelemetryEvent[] = [];

  async appendEvents(events: TelemetryEvent[]) {
    this.events.push(...events);
  }

  async listEventsForOrg(organizationId: string, opts?: { since?: Date; limit?: number }) {
    let matches = this.events.filter((e) => e.organizationId === organizationId);
    if (opts?.since) {
      const since = opts.since;
      matches = matches.filter((e) => e.receivedAt.getTime() >= since.getTime());
    }
    matches = matches.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    return opts?.limit ? matches.slice(0, opts.limit) : matches;
  }
}
