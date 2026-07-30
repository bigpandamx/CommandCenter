import { randomUUID } from "node:crypto";
import type { OrganizationsRepository } from "./repository.js";
import { generateUniqueSlug, slugify } from "./slug.js";
import type { Organization } from "./types.js";
import type { OrganizationProfile, SignupInput, SignupResult } from "./profileTypes.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SignupError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_name" | "invalid_email" | "slug_taken",
  ) {
    super(message);
    this.name = "SignupError";
  }
}

/**
 * Intakes a new organization's sign-up: validates the required fields,
 * resolves a unique slug (explicit override or auto-generated from the
 * name), creates the Organization record -- which is the org ID Aegis
 * should store as its command_center_org_id per CUTOVER.md -- and its
 * profile together. Self-service sign-up always starts on the "trial"
 * entitlement tier; upgrading is a separate staff action
 * (organizationService.ts's setEntitlementTier), not something a sign-up
 * form can grant itself.
 */
export async function signUpOrganization(
  repo: OrganizationsRepository,
  input: SignupInput,
  now: Date = new Date(),
): Promise<SignupResult> {
  const trimmedName = input.organizationName.trim();
  if (!trimmedName) {
    throw new SignupError("Organization name is required", "invalid_name");
  }
  const trimmedEmail = input.primaryContactEmail.trim();
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    throw new SignupError(`Not a valid email address: "${input.primaryContactEmail}"`, "invalid_email");
  }

  let slug: string;
  if (input.slug) {
    const normalized = slugify(input.slug);
    const existing = await repo.getProfileBySlug(normalized);
    if (existing) {
      throw new SignupError(`Slug "${normalized}" is already in use`, "slug_taken");
    }
    slug = normalized;
  } else {
    slug = await generateUniqueSlug(repo, trimmedName);
  }

  const organization: Organization = {
    id: randomUUID(),
    name: trimmedName,
    entitlementTier: "trial",
    createdAt: now,
  };
  await repo.createOrganization(organization);

  const profile: OrganizationProfile = {
    organizationId: organization.id,
    slug,
    primaryContactName: input.primaryContactName.trim(),
    primaryContactEmail: trimmedEmail.toLowerCase(),
    primaryContactPhone: input.primaryContactPhone ?? null,
    industry: input.industry ?? null,
    companySize: input.companySize ?? null,
    website: input.website ?? null,
    country: input.country ?? null,
    notes: input.notes ?? null,
    cloudProviders: input.cloudProviders ?? [],
    aiProviders: input.aiProviders ?? [],
    deviceTypes: input.deviceTypes ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await repo.createProfile(profile);

  return { organization, profile };
}
