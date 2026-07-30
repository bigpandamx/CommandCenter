import { hashSecret, randomToken } from "../../../Platform-Services/Authentication/src/secretHashing.js";
import type { EdgeDevicesRepository } from "./repository.js";

const API_KEY_PREFIX = "agt";
const API_KEY_RANDOM_BYTES = 30;

export class EdgeDeviceNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Edge device not found: ${deviceId}`);
    this.name = "EdgeDeviceNotFoundError";
  }
}

export interface RotateKeyResult {
  apiKey: string;
  apiKeyPrefix: string;
}

/** Invalidates the current API key and issues a new one. The old key stops working immediately -- there's no grace-period overlap, matching Aegis's original rotate_api_key. */
export async function rotateEdgeDeviceKey(
  repo: EdgeDevicesRepository,
  deviceId: string,
  now: Date = new Date(),
): Promise<RotateKeyResult> {
  const device = await repo.getDeviceById(deviceId);
  if (!device) {
    throw new EdgeDeviceNotFoundError(deviceId);
  }

  const secret = randomToken(API_KEY_RANDOM_BYTES);
  const apiKey = `${API_KEY_PREFIX}_${secret}`;
  const apiKeyPrefix = apiKey.slice(0, 8);

  await repo.updateDevice({
    ...device,
    apiKeyHash: hashSecret(apiKey),
    apiKeyPrefix,
    updatedAt: now,
  });

  return { apiKey, apiKeyPrefix };
}

export async function deregisterEdgeDevice(repo: EdgeDevicesRepository, deviceId: string): Promise<void> {
  const device = await repo.getDeviceById(deviceId);
  if (!device) {
    throw new EdgeDeviceNotFoundError(deviceId);
  }
  await repo.deactivateDevice(deviceId);
}
