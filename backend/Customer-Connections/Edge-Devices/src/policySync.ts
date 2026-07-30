import { authenticateEdgeDevice } from "./auth.js";
import type { EdgeDevicesRepository } from "./repository.js";
import type { EdgeDevice } from "./types.js";

/**
 * Records that a device has received and applied a policy snapshot,
 * clearing pendingSync and recording the delivered version -- the
 * "policy_sync_ack" already anticipated in EdgeDevice.pendingSync's own
 * doc comment (types.ts) AND in the "policy_sync_ack" event type
 * already listed in backend/api's event schema, but never actually wired
 * to change any state until now: an ack event would land, get stored as
 * an audit row, and do nothing else -- pendingSync stayed true forever
 * after the first policy push.
 *
 * `applyPolicySyncAck` is the core state change, taking an
 * already-authenticated device -- this is what `ingestEdgeDeviceEvents`
 * (events.ts) calls when a `policy_sync_ack` event appears in a batch,
 * reusing the one authentication already done for the whole batch
 * rather than re-authenticating per event. `recordPolicySyncAck` wraps
 * it with its own authentication, for a caller that wants to record an
 * ack directly without going through the event-batch pathway.
 *
 * This closes the gap CUTOVER.md called "wire Aegis's /config to verify
 * agent via CC": the intended flow is that Aegis's own
 * `GET /{agent_id}/config` handler, after compiling a policy snapshot,
 * has the agent (or Aegis on its behalf) report a `policy_sync_ack`
 * event back to Command Center with the delivered version in its
 * payload -- authentication failure there is itself a legitimate reason
 * for Aegis to have rejected serving the policy in the first place.
 */

export function applyPolicySyncAck(device: EdgeDevice, policySnapshotVersion: string, now: Date): EdgeDevice {
  return {
    ...device,
    policySnapshotVersion,
    lastPolicySync: now,
    pendingSync: false,
    pendingSyncReason: null,
    updatedAt: now,
  };
}

export async function recordPolicySyncAck(
  repo: EdgeDevicesRepository,
  deviceId: string,
  presentedApiKey: string,
  policySnapshotVersion: string,
  now: Date = new Date(),
): Promise<EdgeDevice> {
  const device = await authenticateEdgeDevice(repo, deviceId, presentedApiKey);
  const updated = applyPolicySyncAck(device, policySnapshotVersion, now);
  await repo.updateDevice(updated);
  return updated;
}
