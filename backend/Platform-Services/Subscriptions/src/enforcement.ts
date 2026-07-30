import type { UpdateChannel } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { EntitlementPolicy, LicensingErrorCode } from "./types.js";

export class LicensingError extends Error {
  constructor(message: string, public readonly code: LicensingErrorCode) {
    super(message);
    this.name = "LicensingError";
  }
}

/**
 * Throws if enrolling one more device would exceed the policy's cap.
 * `currentDeviceCount` should reflect active devices only -- callers are
 * responsible for not counting revoked/suspended devices, since those
 * don't occupy an entitlement seat.
 */
export function assertDeviceEnrollmentAllowed(
  policy: EntitlementPolicy,
  currentDeviceCount: number,
): void {
  if (policy.maxDevices === null) return;
  if (currentDeviceCount >= policy.maxDevices) {
    throw new LicensingError(
      `Organization has reached its device limit (${policy.maxDevices}) for the ${policy.tier} tier`,
      "device_limit_reached",
    );
  }
}

export function assertChannelAllowed(
  policy: EntitlementPolicy,
  channel: UpdateChannel,
): void {
  if (!policy.allowedChannels.includes(channel)) {
    throw new LicensingError(
      `The ${policy.tier} tier is not entitled to the "${channel}" update channel`,
      "channel_not_entitled",
    );
  }
}

/** Convenience for admin/reporting UIs: how much of the device cap is used. */
export function deviceUsage(
  policy: EntitlementPolicy,
  currentDeviceCount: number,
): { used: number; limit: number | null; remaining: number | null } {
  return {
    used: currentDeviceCount,
    limit: policy.maxDevices,
    remaining: policy.maxDevices === null ? null : Math.max(policy.maxDevices - currentDeviceCount, 0),
  };
}
