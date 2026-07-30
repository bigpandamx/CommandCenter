import type { EnrollmentToken, Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";

export type { EnrollmentToken, Organization };

export interface CreateOrganizationInput {
  name: string;
  entitlementTier: Organization["entitlementTier"];
}

export interface IssueEnrollmentTokenInput {
  organizationId: string;
  /** Defaults to 1 (single device enrollment). Set higher for e.g. a fleet-provisioning script enrolling many machines off one token. */
  maxUses?: number;
  /** Defaults to 7 days. Enrollment tokens are meant to be handed off and used promptly, not stored long-term. */
  expiresInSeconds?: number;
}
