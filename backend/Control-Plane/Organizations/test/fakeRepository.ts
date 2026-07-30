import type { OrganizationsRepository } from "../src/repository.js";
import type { EnrollmentToken, Organization } from "../src/types.js";
import type { OrganizationProfile, OrganizationSearchQuery } from "../src/profileTypes.js";

export class FakeOrganizationsRepository implements OrganizationsRepository {
  organizations = new Map<string, Organization>();
  tokens = new Map<string, EnrollmentToken>();
  profiles = new Map<string, OrganizationProfile>(); // keyed by organizationId
  profilesBySlug = new Map<string, string>(); // slug -> organizationId

  async createOrganization(org: Organization) {
    this.organizations.set(org.id, org);
  }

  async getOrganization(organizationId: string) {
    return this.organizations.get(organizationId) ?? null;
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
    if (query.cloudProvider) {
      matches = matches.filter((p) => p.cloudProviders.includes(query.cloudProvider as string));
    }
    if (query.aiProvider) {
      matches = matches.filter((p) => p.aiProviders.includes(query.aiProvider as string));
    }
    if (query.deviceType) {
      matches = matches.filter((p) => p.deviceTypes.includes(query.deviceType as string));
    }

    return matches;
  }
}
