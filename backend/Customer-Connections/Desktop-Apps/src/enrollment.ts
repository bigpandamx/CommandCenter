import { randomUUID } from "node:crypto";
import {
  generateDeviceKey,
  isWellFormedDeviceKey,
} from "../../../Platform-Services/Authentication/src/deviceAuth.js";
import {
  assertDeviceEnrollmentAllowed,
  LicensingError,
} from "../../../Platform-Services/Subscriptions/src/enforcement.js";
import type { EntitlementPolicy } from "../../../Platform-Services/Subscriptions/src/types.js";
import type { DesktopSyncRepository } from "./repository.js";
import type { Device, Organization } from "./types.js";

/**
 * Resolves the effective policy for an organization -- injected rather
 * than called directly, so Desktop-Apps doesn't need a BillingRepository
 * wired in just to enroll a device. The caller (backend/api's route layer)
 * closes over the real dependency (Subscriptions' resolveEntitlementPolicy,
 * via the Entitlement Engine) and passes a plain function; tests can pass
 * a trivial one that returns a fixed policy with no repository at all.
 * This is the same reasoning as every other cross-module boundary in
 * this codebase (a repository *interface*, not a concrete
 * implementation) applied to a function instead of an object.
 */
export type PolicyResolver = (
  organization: Pick<Organization, "id" | "entitlementTier">,
) => Promise<EntitlementPolicy>;

export interface EnrollRequest {
  token: string;
  fingerprint: string;
  displayName: string;
  platform: Device["platform"];
  appVersion: string;
}

export interface EnrollResult {
  deviceId: string;
  /** Shown to the caller exactly once. The client must store this; Command Center cannot re-display it. */
  apiKey: string;
  organizationId: string;
  /** The organization's name at time of enrollment. Added so a caller that's provisioning a brand-new local tenant from this token (e.g. Aegis's own org-activation flow, which no longer creates organizations itself -- see CUTOVER.md) doesn't need a second, separately-authenticated call just to learn what to call it. */
  organizationName: string;
  channel: Device["channel"];
}

export class EnrollmentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_token"
      | "token_expired"
      | "token_exhausted"
      | "org_not_found"
      | "device_limit_reached",
  ) {
    super(message);
    this.name = "EnrollmentError";
  }
}

/**
 * Enroll a new (or re-enroll an existing, matching-fingerprint) Aegis
 * desktop install. Idempotent on fingerprint: re-running enrollment for the
 * same org+fingerprint rotates the key rather than creating a duplicate
 * device row, so a reinstall doesn't orphan the old device record.
 *
 * A device cap (Platform-Services/Subscriptions, via the Entitlement
 * Engine) is enforced only when this would create a genuinely new device
 * -- re-enrolling an existing fingerprint (key rotation, reinstall) never
 * counts against the cap, since it doesn't consume an additional seat.
 *
 * `resolvePolicy` replaces what used to be a hardcoded
 * `defaultPolicyForTier(org.entitlementTier)` call -- the real,
 * subscription-aware policy (device caps and channels actually
 * purchased, not just the static tier default) now comes from whatever
 * the caller injects, closing a gap this repo's own CUTOVER.md had
 * named across several sessions: resolveEntitlementPolicy existed but
 * was never actually wired into enrollment.
 */
export async function enrollDevice(
  repo: DesktopSyncRepository,
  request: EnrollRequest,
  resolvePolicy: PolicyResolver,
  now: Date = new Date(),
): Promise<EnrollResult> {
  const enrollmentToken = await repo.getEnrollmentToken(request.token);
  if (!enrollmentToken) {
    throw new EnrollmentError("Unknown enrollment token", "invalid_token");
  }
  if (enrollmentToken.expiresAt.getTime() <= now.getTime()) {
    throw new EnrollmentError("Enrollment token has expired", "token_expired");
  }
  if (enrollmentToken.useCount >= enrollmentToken.maxUses) {
    throw new EnrollmentError(
      "Enrollment token has already been used",
      "token_exhausted",
    );
  }

  const org = await repo.getOrganization(enrollmentToken.organizationId);
  if (!org) {
    throw new EnrollmentError(
      "Organization for this token no longer exists",
      "org_not_found",
    );
  }

  const existing = await repo.getDeviceByFingerprint(
    org.id,
    request.fingerprint,
  );

  const policy = await resolvePolicy(org);

  if (!existing) {
    const currentCount = await repo.countActiveDevicesForOrg(org.id);
    try {
      assertDeviceEnrollmentAllowed(policy, currentCount);
    } catch (err) {
      if (err instanceof LicensingError) {
        throw new EnrollmentError(err.message, "device_limit_reached");
      }
      throw err;
    }
  }

  const deviceId = existing?.id ?? randomUUID();
  const generatedKey = generateDeviceKey(deviceId);

  const device: Device = {
    id: deviceId,
    organizationId: org.id,
    apiKeyHash: generatedKey.hash,
    fingerprint: request.fingerprint,
    displayName: request.displayName,
    platform: request.platform,
    appVersion: request.appVersion,
    // First channel in the resolved policy is its default -- Subscriptions owns this list, not a locally duplicated mapping.
    channel: existing?.channel ?? policy.allowedChannels[0] ?? "stable",
    status: "active",
    enrolledAt: existing?.enrolledAt ?? now,
    lastCheckinAt: existing?.lastCheckinAt ?? null,
  };

  await repo.createDevice(device);
  await repo.consumeEnrollmentToken(request.token);

  return {
    deviceId: device.id,
    apiKey: generatedKey.plaintext,
    organizationId: org.id,
    organizationName: org.name,
    channel: device.channel,
  };
}

/** Re-export for callers that only need the format check, not full enrollment. */
export { isWellFormedDeviceKey };
