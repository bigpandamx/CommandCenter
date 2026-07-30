import { authenticateEdgeDevice } from "./auth.js";
import type { EdgeDevicesRepository } from "./repository.js";

export interface HeartbeatInput {
  version?: string | null;
}

export interface HeartbeatResult {
  policySnapshotVersion: string | null;
  needsSync: boolean;
}

/**
 * Records a heartbeat and reports whether the device should pull a fresh
 * policy snapshot. Mirrors AgentSyncService.record_heartbeat in Aegis: a
 * device on any status heartbeats back to "active" (recovering from
 * degraded/offline), and pendingSync is re-read fresh after the update in
 * case it changed concurrently -- e.g. an operator pushed a policy update
 * between this device's last two heartbeats.
 */
export async function recordHeartbeat(
  repo: EdgeDevicesRepository,
  deviceId: string,
  presentedApiKey: string,
  input: HeartbeatInput,
  now: Date = new Date(),
): Promise<HeartbeatResult> {
  const device = await authenticateEdgeDevice(repo, deviceId, presentedApiKey);

  await repo.updateDevice({
    ...device,
    status: "active",
    lastHeartbeat: now,
    version: input.version ?? device.version,
    updatedAt: now,
  });

  // Re-fetch rather than trust the in-memory `device` from before the
  // update -- pendingSync could have been flagged by a concurrent
  // signalPendingSync call between authenticateEdgeDevice and here.
  const refreshed = await repo.getDeviceById(deviceId);
  return {
    policySnapshotVersion: refreshed?.policySnapshotVersion ?? null,
    needsSync: refreshed?.pendingSync ?? false,
  };
}
