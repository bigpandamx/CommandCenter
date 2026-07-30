import { verifySecret } from "../../../Platform-Services/Authentication/src/secretHashing.js";
import type { EdgeDevicesRepository } from "./repository.js";
import type { EdgeDevice } from "./types.js";

export class EdgeDeviceAuthError extends Error {
  constructor(
    message: string,
    public readonly code: "device_not_found" | "device_inactive" | "unauthorized",
  ) {
    super(message);
    this.name = "EdgeDeviceAuthError";
  }
}

/**
 * Authenticates an edge device from its id + presented API key (the
 * X-Agent-ID / X-Agent-Key header pair in Aegis's original design --
 * transport-layer detail, backend/api's route handler owns header parsing,
 * this function just takes the two values). Returns the device on
 * success; throws on any failure so callers can't accidentally treat a
 * failed auth as a valid device.
 */
export async function authenticateEdgeDevice(
  repo: EdgeDevicesRepository,
  deviceId: string,
  presentedApiKey: string,
): Promise<EdgeDevice> {
  const device = await repo.getDeviceById(deviceId);
  if (!device) {
    throw new EdgeDeviceAuthError("Unknown edge device", "device_not_found");
  }
  if (!device.isActive) {
    throw new EdgeDeviceAuthError("Edge device has been deactivated", "device_inactive");
  }
  if (!verifySecret(presentedApiKey, device.apiKeyHash)) {
    throw new EdgeDeviceAuthError("Invalid edge device credentials", "unauthorized");
  }
  return device;
}
