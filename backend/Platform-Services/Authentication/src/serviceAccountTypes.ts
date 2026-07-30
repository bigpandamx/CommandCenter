import type { Permission } from "./rbac.js";

/**
 * Service accounts authenticate OTHER SERVICES (starting with Aegis's
 * own backend) to Command Center -- distinct from staff sessions (a
 * human logged in) and device/edge-device keys (a specific desktop
 * install or enforcement agent). This is what closes the gap noted in
 * CUTOVER.md: Aegis's backend needs a way to call
 * GET /v1/service/compliance/updates unattended, without a staff member
 * being logged in.
 *
 * Deliberately reuses the same Permission type as staff RBAC (rbac.ts)
 * rather than inventing a parallel scope system -- "compliance:read" means
 * the same thing whether it's granted to a staff role or a service
 * account. A service account's `scopes` is just a direct list of
 * Permission values it's been granted, checked with assertServiceScope
 * in serviceAccountService.ts.
 */

export type ServiceAccountStatus = "active" | "revoked";

export interface ServiceAccount {
  id: string;
  name: string;
  description: string | null;
  apiKeyHash: string;
  scopes: Permission[];
  status: ServiceAccountStatus;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface CreateServiceAccountInput {
  name: string;
  description?: string | null;
  scopes: Permission[];
}
