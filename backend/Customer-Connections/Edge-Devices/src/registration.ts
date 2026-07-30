import { randomUUID } from "node:crypto";
import { hashSecret, randomToken } from "../../../Platform-Services/Authentication/src/secretHashing.js";
import type { EdgeDevicesRepository } from "./repository.js";
import type { EdgeDevice, RegisterEdgeDeviceInput } from "./types.js";

const API_KEY_PREFIX = "agt";
const API_KEY_RANDOM_BYTES = 30;

export interface RegisterEdgeDeviceResult {
  deviceId: string;
  /** Shown exactly once -- Command Center stores only the hash. */
  apiKey: string;
  apiKeyPrefix: string;
  status: EdgeDevice["status"];
}

/**
 * Registers a new edge device (enforcement agent). Unlike
 * Desktop-Apps.enrollDevice, there's no enrollment-token exchange here --
 * registration is a direct staff/operator action (an org admin or Aegis
 * staff registers a device through the dashboard), matching Aegis's
 * original design where registration required an authenticated user
 * session, not a token handed to an installer.
 *
 * Device ids are plain UUIDs (Command Center's convention, matching
 * Desktop-Apps devices) rather than Aegis's original `agt_<hex20>`
 * format -- a deliberate normalization, not a compatibility requirement,
 * since nothing outside this system parses the id's shape.
 */
export async function registerEdgeDevice(
  repo: EdgeDevicesRepository,
  input: RegisterEdgeDeviceInput,
  now: Date = new Date(),
): Promise<RegisterEdgeDeviceResult> {
  const deviceId = randomUUID();
  const secret = randomToken(API_KEY_RANDOM_BYTES);
  const apiKey = `${API_KEY_PREFIX}_${secret}`;
  const apiKeyPrefix = apiKey.slice(0, 8);

  const device: EdgeDevice = {
    id: deviceId,
    organizationId: input.organizationId,
    name: input.name,
    description: input.description ?? null,
    deploymentType: input.deploymentType,
    environment: input.environment ?? null,
    version: null,
    apiKeyHash: hashSecret(apiKey),
    apiKeyPrefix,
    status: "provisioning",
    lastHeartbeat: null,
    // No policy snapshot at registration time -- Aegis pre-compiles one
    // synchronously in the original design so the device's first /config
    // pull is instant; Command Center doesn't have policy data to compile,
    // so the device's first heartbeat will correctly show pendingSync
    // implicitly via a null policySnapshotVersion. Document, don't fake it.
    policySnapshotVersion: null,
    lastPolicySync: null,
    pendingSync: false,
    pendingSyncReason: null,
    ipAllowlist: input.ipAllowlist ?? null,
    isActive: true,
    metadata: input.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await repo.createDevice(device);

  return { deviceId, apiKey, apiKeyPrefix, status: device.status };
}
