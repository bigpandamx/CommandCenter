import { randomUUID } from "node:crypto";
import type { FleetOperationsRepository } from "./repository.js";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import type { FleetHeartbeat, FleetHeartbeatInput, FleetInstanceSummary } from "./types.js";

/** No heartbeat in this long -- default 15 minutes, a reasonable heartbeat-monitoring interval, not a claim about how often Aegis actually checks in (that's Aegis's own choice; this is just the threshold Command Center uses to call a gap "stale"). Overridable per call, not hardcoded into computeFleetSummary itself. */
const DEFAULT_STALE_THRESHOLD_MS = 15 * 60 * 1000;

const HEALTH_SCORE_MIN = 0;
const HEALTH_SCORE_MAX = 100;

export class FleetOperationsError extends Error {
  constructor(
    message: string,
    public readonly code: "organization_not_found" | "invalid_health_score",
  ) {
    super(message);
    this.name = "FleetOperationsError";
  }
}

/**
 * Records one heartbeat. Validates the organization actually exists
 * (a heartbeat for an unknown org is a real integration bug worth
 * surfacing loudly, not silently accepting orphaned data) and that
 * healthScore is a sane 0-100 -- structural validation only. Command
 * Center does NOT judge whether the reported score is actually
 * accurate; that's the instance's own job, see types.ts's module doc
 * comment.
 */
export async function ingestHeartbeat(
  fleetRepo: FleetOperationsRepository,
  orgsRepo: OrganizationsRepository,
  organizationId: string,
  input: FleetHeartbeatInput,
  now: Date = new Date(),
): Promise<FleetHeartbeat> {
  const organization = await orgsRepo.getOrganization(organizationId);
  if (!organization) {
    throw new FleetOperationsError(`Unknown organization: ${organizationId}`, "organization_not_found");
  }
  if (!Number.isFinite(input.healthScore) || input.healthScore < HEALTH_SCORE_MIN || input.healthScore > HEALTH_SCORE_MAX) {
    throw new FleetOperationsError(
      `healthScore must be a number between ${HEALTH_SCORE_MIN} and ${HEALTH_SCORE_MAX}, got ${input.healthScore}`,
      "invalid_health_score",
    );
  }

  const heartbeat: FleetHeartbeat = {
    id: randomUUID(),
    organizationId,
    version: input.version,
    installedModules: input.installedModules,
    licenseState: input.licenseState,
    healthScore: input.healthScore,
    failedJobCount: input.failedJobCount,
    pendingMigrationCount: input.pendingMigrationCount,
    receivedAt: now,
  };
  await fleetRepo.appendHeartbeat(heartbeat);
  return heartbeat;
}

/**
 * The live fleet dashboard's actual data: every org's latest
 * heartbeat, each marked stale or not. `stale` is computed here, from
 * Command Center's own clock against `receivedAt` -- not something any
 * instance reports about itself, since an instance that's stopped
 * heartbeating entirely has no way to tell you it has.
 */
export async function computeFleetSummary(
  fleetRepo: FleetOperationsRepository,
  now: Date = new Date(),
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): Promise<FleetInstanceSummary[]> {
  const latest = await fleetRepo.listLatestHeartbeats();
  return latest.map((heartbeat) => ({
    organizationId: heartbeat.organizationId,
    latestHeartbeat: heartbeat,
    stale: now.getTime() - heartbeat.receivedAt.getTime() > staleThresholdMs,
  }));
}
