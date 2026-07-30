import type { EnrollmentToken, Organization } from "./types.js";
import type { OrganizationProfile, OrganizationSearchQuery } from "./profileTypes.js";

/**
 * Port for organization lifecycle and enrollment-token issuance. Deliberately
 * separate from Customer-Connections/Desktop-Apps's DesktopSyncRepository:
 * that port is "what a device needs to sync", this one is "what a Command
 * Center operator needs to administer an org". The Postgres implementation
 * (Platform-Services/Databases) can and does back both from the same
 * `organizations` / `enrollment_tokens` tables -- the split is about who's
 * allowed to call which operations, not about physical storage.
 */
export interface OrganizationsRepository {
  createOrganization(org: Organization): Promise<void>;
  getOrganization(organizationId: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;
  updateEntitlementTier(
    organizationId: string,
    tier: Organization["entitlementTier"],
  ): Promise<void>;
  /** Persists the Stripe customer id created for this org's first paid subscription (see ensureStripeCustomer in Platform-Services/Subscriptions/src/stripeIntegration.ts). */
  updateStripeCustomerId(organizationId: string, stripeCustomerId: string): Promise<void>;

  createEnrollmentToken(token: EnrollmentToken): Promise<void>;
  listEnrollmentTokens(organizationId: string): Promise<EnrollmentToken[]>;
  /** Sets expiresAt to now, so the token can no longer be consumed by enrollDevice, without deleting the audit row. */
  revokeEnrollmentToken(token: string): Promise<void>;

  createProfile(profile: OrganizationProfile): Promise<void>;
  getProfileByOrganizationId(organizationId: string): Promise<OrganizationProfile | null>;
  /** Used for slug-uniqueness checks at signup -- see signup.ts's slug-collision handling. */
  getProfileBySlug(slug: string): Promise<OrganizationProfile | null>;
  updateProfile(profile: OrganizationProfile): Promise<void>;
  searchProfiles(query: OrganizationSearchQuery): Promise<OrganizationProfile[]>;
}
