/**
 * RBAC for internal Command Center staff (Aegis employees/developers),
 * distinct from anything customer-facing -- customers never log into
 * Command Center, per the product's own design. Kept deliberately small:
 * three roles, a flat permission set. Expand the Permission union as more
 * admin surface area gets built, not by adding ad hoc role checks in route
 * handlers.
 */

export type StaffRole = "viewer" | "operator" | "admin";

export type Permission =
  | "org:read"
  | "org:create"
  | "org:set_entitlement"
  | "enrollment_token:issue"
  | "enrollment_token:revoke"
  | "staff:read"
  | "staff:manage"
  | "billing:read"
  | "billing:manage"
  | "compliance:read"
  | "compliance:manage"
  | "service_account:manage"
  | "ticket:read"
  | "ticket:create"
  | "ticket:manage"
  | "threat_intel:read"
  | "threat_intel:manage"
  | "threat_intel:report"
  | "risk_intel:read"
  | "risk_intel:manage"
  | "agents:read"
  | "agents:manage"
  | "announcements:read"
  | "announcements:manage"
  | "ai_chat:read"
  | "subscription:adopt"
  | "feature_flag:read"
  | "feature_flag:manage"
  | "event:publish"
  | "event:read"
  | "service_catalog:read"
  | "service_catalog:manage"
  | "platform_health:read"
  | "fleet:read"
  | "fleet:report"
  | "jobs:read"
  | "jobs:manage"
  | "governance:read"
  | "governance:manage";

// Single canonical list of every permission that exists -- admin's set
// below is derived from this, not independently maintained, and this
// is what other modules (e.g. serviceAccountAdmin.ts's scope
// validation) should import instead of keeping their own copy. Two
// independently-maintained lists is exactly how a new permission
// (feature_flag:*, event:*) ends up valid for staff roles but silently
// rejected when granting it to a service account -- a real bug this
// export exists to make structurally impossible going forward.
export const ALL_PERMISSIONS: readonly Permission[] = [
  "org:read",
  "org:create",
  "org:set_entitlement",
  "enrollment_token:issue",
  "enrollment_token:revoke",
  "staff:read",
  "staff:manage",
  "billing:read",
  "billing:manage",
  "compliance:read",
  "compliance:manage",
  "service_account:manage",
  "ticket:read",
  "ticket:create",
  "ticket:manage",
  "threat_intel:read",
  "threat_intel:manage",
  "threat_intel:report",
  "risk_intel:read",
  "risk_intel:manage",
  "agents:read",
  "agents:manage",
  "announcements:read",
  "announcements:manage",
  "ai_chat:read",
  "subscription:adopt",
  "feature_flag:read",
  "feature_flag:manage",
  "event:publish",
  "event:read",
  "service_catalog:read",
  "service_catalog:manage",
  "platform_health:read",
  "fleet:read",
  "fleet:report",
  "jobs:read",
  "jobs:manage",
  "governance:read",
  "governance:manage",
];

const ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<Permission>> = {
  viewer: new Set([
    "org:read",
    "billing:read",
    "compliance:read",
    "ticket:read",
    "staff:read",
    "threat_intel:read",
    "risk_intel:read",
    "agents:read",
    "announcements:read",
    "ai_chat:read",
    "feature_flag:read",
    "event:read",
    "service_catalog:read",
    "platform_health:read",
    "fleet:read",
    "jobs:read",
    "governance:read",
  ]),
  operator: new Set([
    "org:read",
    "org:create",
    "enrollment_token:issue",
    "enrollment_token:revoke",
    "billing:read",
    "compliance:read",
    "ticket:read",
    "ticket:create",
    "ticket:manage",
    "staff:read",
    "threat_intel:read",
    "threat_intel:manage",
    "threat_intel:report",
    "risk_intel:read",
    "risk_intel:manage",
    "agents:read",
    "agents:manage",
    "announcements:read",
    "announcements:manage",
    "ai_chat:read",
    "feature_flag:read",
    "event:read",
    "service_catalog:read",
    "platform_health:read",
    "fleet:read",
    "jobs:read",
    "jobs:manage",
    "governance:read",
    "governance:manage",
  ]),
  admin: new Set(ALL_PERMISSIONS),
};

export function roleHasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing required permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertPermission(role: StaffRole, permission: Permission): void {
  if (!roleHasPermission(role, permission)) {
    throw new ForbiddenError(permission);
  }
}
