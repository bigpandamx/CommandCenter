import { randomBytes, randomUUID } from "node:crypto";
import type { OrganizationsRepository } from "./repository.js";
import type {
  CreateOrganizationInput,
  EnrollmentToken,
  IssueEnrollmentTokenInput,
  Organization,
} from "./types.js";

const DEFAULT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_MAX_USES = 1;

export class OrganizationNotFoundError extends Error {
  constructor(organizationId: string) {
    super(`Organization not found: ${organizationId}`);
    this.name = "OrganizationNotFoundError";
  }
}

export async function createOrganization(
  repo: OrganizationsRepository,
  input: CreateOrganizationInput,
  now: Date = new Date(),
): Promise<Organization> {
  const org: Organization = {
    id: randomUUID(),
    name: input.name,
    entitlementTier: input.entitlementTier,
    createdAt: now,
  };
  await repo.createOrganization(org);
  return org;
}

/**
 * Generates a new enrollment token for an org and persists it. The token
 * string itself carries no meaning (unlike device API keys, it's not
 * hashed at rest -- a leaked enrollment token is bounded-blast-radius by
 * design: short TTL, capped use count, and it only grants "become a device
 * in this org", not access to existing data).
 */
export async function issueEnrollmentToken(
  repo: OrganizationsRepository,
  input: IssueEnrollmentTokenInput,
  now: Date = new Date(),
): Promise<EnrollmentToken> {
  const org = await repo.getOrganization(input.organizationId);
  if (!org) {
    throw new OrganizationNotFoundError(input.organizationId);
  }

  const ttlSeconds = input.expiresInSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
  const token: EnrollmentToken = {
    token: `enr_${randomBytes(24).toString("base64url")}`,
    organizationId: org.id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    consumedAt: null,
    maxUses: input.maxUses ?? DEFAULT_MAX_USES,
    useCount: 0,
  };

  await repo.createEnrollmentToken(token);
  return token;
}

export async function revokeEnrollmentToken(
  repo: OrganizationsRepository,
  token: string,
): Promise<void> {
  await repo.revokeEnrollmentToken(token);
}

export async function setEntitlementTier(
  repo: OrganizationsRepository,
  organizationId: string,
  tier: Organization["entitlementTier"],
): Promise<void> {
  const org = await repo.getOrganization(organizationId);
  if (!org) {
    throw new OrganizationNotFoundError(organizationId);
  }
  await repo.updateEntitlementTier(organizationId, tier);
}
