import { verifyDeviceKey } from "../../../Platform-Services/Authentication/src/deviceAuth.js";
import type { DesktopSyncRepository } from "./repository.js";
import { resolveUpdate } from "./updateManifest.js";
import type { CheckinRequest, CheckinResponse } from "./types.js";

/** Baseline check-in cadence; halved automatically when an update or command is pending, so devices don't sit idle for a full interval before acting. */
const DEFAULT_CHECKIN_INTERVAL_SECONDS = 15 * 60;

export class CheckinError extends Error {
  constructor(
    message: string,
    public readonly code: "unauthorized" | "device_not_found" | "device_revoked",
  ) {
    super(message);
    this.name = "CheckinError";
  }
}

/**
 * Authenticate a device's API key against the stored hash. Throws
 * CheckinError rather than returning false so callers can't accidentally
 * fall through an unauthenticated path.
 */
export async function authenticateDevice(
  repo: DesktopSyncRepository,
  deviceId: string,
  presentedApiKey: string,
  storedApiKeyHash: string,
): Promise<void> {
  const ok = verifyDeviceKey(presentedApiKey, storedApiKeyHash);
  if (!ok) {
    throw new CheckinError("Invalid device credentials", "unauthorized");
  }
  void deviceId; // reserved for audit logging by the caller
}

export async function handleCheckin(
  repo: DesktopSyncRepository,
  request: CheckinRequest,
  presentedApiKey: string,
  now: Date = new Date(),
): Promise<CheckinResponse> {
  const device = await repo.getDeviceById(request.deviceId);
  if (!device) {
    throw new CheckinError("Unknown device", "device_not_found");
  }
  if (device.status === "revoked") {
    throw new CheckinError("Device has been revoked", "device_revoked");
  }

  await authenticateDevice(repo, device.id, presentedApiKey, device.apiKeyHash);

  await repo.updateDeviceCheckin(device.id, request.appVersion, now);

  const commands = await repo.getPendingCommands(device.id);
  const update = await resolveUpdate(repo, {
    channel: device.channel,
    platform: device.platform,
    appVersion: request.appVersion,
  });

  const hasWork = commands.length > 0 || update.updateAvailable;

  return {
    serverTime: now.toISOString(),
    updateAvailable: update.updateAvailable,
    latestVersion: update.manifest?.version ?? null,
    commands,
    nextCheckinSeconds: hasWork
      ? DEFAULT_CHECKIN_INTERVAL_SECONDS / 2
      : DEFAULT_CHECKIN_INTERVAL_SECONDS,
  };
}
