import type { OrganizationsRepository } from "./repository.js";
import type {
  OrganizationProfile,
  OrganizationSearchQuery,
  OrganizationWithProfile,
} from "./profileTypes.js";

export class ProfileError extends Error {
  constructor(
    message: string,
    public readonly code: "profile_not_found" | "organization_not_found",
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

/** Joins an org and its profile -- the shape most callers actually want ("find this organization") rather than the two records separately. */
export async function getOrganizationWithProfile(
  repo: OrganizationsRepository,
  organizationId: string,
): Promise<OrganizationWithProfile> {
  const organization = await repo.getOrganization(organizationId);
  if (!organization) {
    throw new ProfileError(`Unknown organization: ${organizationId}`, "organization_not_found");
  }
  const profile = await repo.getProfileByOrganizationId(organizationId);
  if (!profile) {
    // Shouldn't happen for anything created via signUpOrganization (which
    // always creates both together), but a legacy org migrated in without
    // one (e.g. via the CUTOVER.md backfill script, before this module
    // existed) is a real possibility -- surface it distinctly rather than
    // silently returning a fabricated empty profile.
    throw new ProfileError(`No profile found for organization: ${organizationId}`, "profile_not_found");
  }
  return { organization, profile };
}

export async function findOrganizationBySlug(
  repo: OrganizationsRepository,
  slug: string,
): Promise<OrganizationWithProfile | null> {
  const profile = await repo.getProfileBySlug(slug);
  if (!profile) return null;
  const organization = await repo.getOrganization(profile.organizationId);
  if (!organization) return null;
  return { organization, profile };
}

/**
 * Free-text-ish search across name/slug/contact fields, plus optional
 * exact filters on industry/companySize. This is what makes "finding a
 * particular organization" actually practical once there are more than a
 * handful -- searching by a fragment of the company name or the contact's
 * email, not just scrolling a full list.
 */
export async function searchOrganizations(
  repo: OrganizationsRepository,
  query: OrganizationSearchQuery,
): Promise<OrganizationWithProfile[]> {
  const profiles = await repo.searchProfiles(query);
  const results: OrganizationWithProfile[] = [];
  for (const profile of profiles) {
    const organization = await repo.getOrganization(profile.organizationId);
    if (organization) {
      results.push({ organization, profile });
    }
  }
  return results;
}

export interface UpdateProfileInput {
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string | null;
  industry?: string | null;
  companySize?: OrganizationProfile["companySize"];
  website?: string | null;
  country?: string | null;
  notes?: string | null;
  cloudProviders?: string[];
  aiProviders?: string[];
  deviceTypes?: string[];
}

export async function updateOrganizationProfile(
  repo: OrganizationsRepository,
  organizationId: string,
  updates: UpdateProfileInput,
  now: Date = new Date(),
): Promise<OrganizationProfile> {
  const existing = await repo.getProfileByOrganizationId(organizationId);
  if (!existing) {
    throw new ProfileError(`No profile found for organization: ${organizationId}`, "profile_not_found");
  }

  const updated: OrganizationProfile = {
    ...existing,
    ...updates,
    updatedAt: now,
  };
  await repo.updateProfile(updated);
  return updated;
}
