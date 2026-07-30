import type { EdgeDevicesRepository } from "./repository.js";

/** Agent is considered "degraded" after missing 3 x the ~30s heartbeat interval. Matches Aegis's HEARTBEAT_TIMEOUT_SECONDS exactly -- these numbers came from real operational tuning there, not re-derived here. */
export const DEGRADED_AFTER_SECONDS = 90;
/** Agent is considered fully "offline" after this much longer with no heartbeat. Matches Aegis's OFFLINE_GRACE_PERIOD_SECONDS. */
export const OFFLINE_AFTER_SECONDS = 300;

export interface SweepResult {
  markedDegraded: number;
  markedOffline: number;
}

/**
 * Intended to run on a schedule (e.g. every 60s) against the whole
 * fleet, not per-request. Devices that have been offline long enough
 * transition straight to "offline"; devices in the shorter window
 * transition to "degraded" first. A device that heartbeats again always
 * goes straight back to "active" (see heartbeat.ts) regardless of which
 * of these states it was in.
 */
export async function sweepStaleEdgeDevices(
  repo: EdgeDevicesRepository,
  now: Date = new Date(),
): Promise<SweepResult> {
  const degradedThreshold = new Date(now.getTime() - DEGRADED_AFTER_SECONDS * 1000);
  const offlineThreshold = new Date(now.getTime() - OFFLINE_AFTER_SECONDS * 1000);
  const { markedDegraded, markedOffline } = await repo.sweepStaleDevices(degradedThreshold, offlineThreshold);
  return { markedDegraded, markedOffline };
}

/**
 * Called when Aegis reports a policy change for an organization (a
 * cross-service call from Aegis into Command Center -- see CUTOVER.md;
 * not yet wired up on Aegis's side). Flags every active device in the
 * org so the next heartbeat's needsSync comes back true. Devices that
 * are already offline are NOT flagged -- there's no point telling an
 * unreachable device to resync; it'll see pendingSync from a later call
 * once it's heartbeating again, or an operator can re-trigger this after
 * the device recovers.
 */
export async function signalPendingSync(
  repo: EdgeDevicesRepository,
  organizationId: string,
  reason: string,
): Promise<number> {
  return repo.flagPendingSyncForOrg(organizationId, reason);
}
