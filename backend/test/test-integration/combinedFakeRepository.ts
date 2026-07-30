import type { OrganizationsRepository } from "../../Control-Plane/Organizations/src/repository.js";
import type { OrganizationProfile, OrganizationSearchQuery } from "../../Control-Plane/Organizations/src/profileTypes.js";
import type { DesktopSyncRepository } from "../../Customer-Connections/Desktop-Apps/src/repository.js";
import type {
  Device,
  EnrollmentToken,
  Organization,
  PendingCommand,
  UpdateManifestEntry,
} from "../../Customer-Connections/Desktop-Apps/src/types.js";

/**
 * In production these two ports are both implemented by
 * PgDesktopSyncRepository / a sibling class in Platform-Services/Databases,
 * backed by the same `organizations` and `enrollment_tokens` tables (see
 * the comment on OrganizationsRepository). This combined fake exists only
 * so we can integration-test that seam without standing up Postgres.
 */
export class CombinedFakeRepository
  implements OrganizationsRepository, DesktopSyncRepository
{
  organizations = new Map<string, Organization>();
  tokens = new Map<string, EnrollmentToken>();
  devices = new Map<string, Device>();
  devicesByFingerprint = new Map<string, string>();
  commands = new Map<string, PendingCommand[]>();
  manifests: UpdateManifestEntry[] = [];
  profiles = new Map<string, OrganizationProfile>();
  profilesBySlug = new Map<string, string>();

  // --- OrganizationsRepository ---
  async createOrganization(org: Organization) {
    this.organizations.set(org.id, org);
  }
  async listOrganizations() {
    return [...this.organizations.values()];
  }
  async updateEntitlementTier(organizationId: string, tier: Organization["entitlementTier"]) {
    const org = this.organizations.get(organizationId);
    if (org) org.entitlementTier = tier;
  }
  async updateStripeCustomerId(organizationId: string, stripeCustomerId: string) {
    const org = this.organizations.get(organizationId);
    if (org) org.stripeCustomerId = stripeCustomerId;
  }
  async createEnrollmentToken(token: EnrollmentToken) {
    this.tokens.set(token.token, token);
  }
  async listEnrollmentTokens(organizationId: string) {
    return [...this.tokens.values()].filter((t) => t.organizationId === organizationId);
  }
  async revokeEnrollmentToken(token: string) {
    const t = this.tokens.get(token);
    if (t) t.expiresAt = new Date(0);
  }
  async createProfile(profile: OrganizationProfile) {
    this.profiles.set(profile.organizationId, profile);
    this.profilesBySlug.set(profile.slug, profile.organizationId);
  }
  async getProfileByOrganizationId(organizationId: string) {
    return this.profiles.get(organizationId) ?? null;
  }
  async getProfileBySlug(slug: string) {
    const orgId = this.profilesBySlug.get(slug);
    return orgId ? this.profiles.get(orgId) ?? null : null;
  }
  async updateProfile(profile: OrganizationProfile) {
    const existing = this.profiles.get(profile.organizationId);
    if (existing && existing.slug !== profile.slug) {
      this.profilesBySlug.delete(existing.slug);
      this.profilesBySlug.set(profile.slug, profile.organizationId);
    }
    this.profiles.set(profile.organizationId, profile);
  }
  async searchProfiles(query: OrganizationSearchQuery) {
    let matches = [...this.profiles.values()];
    if (query.text) {
      const needle = query.text.toLowerCase();
      matches = matches.filter((p) => {
        const org = this.organizations.get(p.organizationId);
        return (
          (org?.name.toLowerCase().includes(needle) ?? false) ||
          p.slug.toLowerCase().includes(needle) ||
          p.primaryContactName.toLowerCase().includes(needle) ||
          p.primaryContactEmail.toLowerCase().includes(needle)
        );
      });
    }
    if (query.industry) {
      matches = matches.filter((p) => p.industry === query.industry);
    }
    if (query.companySize) {
      matches = matches.filter((p) => p.companySize === query.companySize);
    }
    return matches;
  }

  // --- shared ---
  async getOrganization(organizationId: string) {
    return this.organizations.get(organizationId) ?? null;
  }

  // --- DesktopSyncRepository ---
  async getEnrollmentToken(token: string) {
    return this.tokens.get(token) ?? null;
  }
  async consumeEnrollmentToken(token: string) {
    const t = this.tokens.get(token);
    if (t) t.useCount += 1;
  }
  async createDevice(device: Device) {
    this.devices.set(device.id, device);
    this.devicesByFingerprint.set(`${device.organizationId}:${device.fingerprint}`, device.id);
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
    const remaining = (this.commands.get(deviceId) ?? []).filter((c) => !commandIds.includes(c.id));
    this.commands.set(deviceId, remaining);
  }
  async getLatestManifest(channel: Device["channel"], platform: Device["platform"]) {
    const matches = this.manifests
      .filter((m) => m.channel === channel && m.platform === platform)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    return matches[0] ?? null;
  }
}
