/**
 * Fleet Operations: every deployed customer Aegis instance reports its
 * own status into Command Center. Genuinely distinct from
 * Customer-Connections/Desktop-Apps' telemetry (per-DEVICE events from
 * an individual endpoint running the desktop app) -- this is
 * per-ORGANIZATION, platform-level reporting from the customer's own
 * deployed Aegis backend: what version is running, what's installed,
 * whether its license is valid, its own self-assessed health, and its
 * own operational backlog (failed jobs, pending migrations). There is
 * no existing "instance" concept anywhere in this codebase separate
 * from Organization -- every other pattern here (one subscription, one
 * enrollment flow) models a 1:1 relationship between an org and its
 * infrastructure, so this does too: one fleet identity per
 * organizationId, not a separate multi-instance-per-org concept
 * without evidence it's needed.
 *
 * `healthScore` is self-reported, not computed by Command Center --
 * Aegis's own backend knows its own internals (queue depths, error
 * rates, whatever it factors in) far better than Command Center could
 * reconstruct from the outside. Command Center's job is to receive,
 * store, and surface what's reported, and to independently derive the
 * one thing it genuinely CAN judge better than the reporter: whether a
 * heartbeat has gone stale (see computeFleetSummary in
 * fleetService.ts) -- an instance's own self-reported health score
 * can't tell you it's stopped reporting at all.
 *
 * Every heartbeat is stored as its own row (same pattern as
 * Platform-Services/PlatformHealth's AiCallRecord/RequestLatencyRecord),
 * not just the latest overwritten in place -- a fleet dashboard's
 * primary need is "what's true right now," but "how has this org's
 * health trended" is a real, related question that a latest-only model
 * can't answer at all.
 */

/**
 * A small, closed union -- unlike `installedModules` (genuinely
 * open-ended, a new module shouldn't require this file touched), a
 * license state has real, bounded business meaning: enforcement/
 * alerting logic downstream needs to switch on a known, finite set of
 * values, not an arbitrary string an instance could report anything
 * into.
 */
export type FleetLicenseState = "active" | "trial" | "expired" | "suspended" | "unknown";

export interface FleetHeartbeat {
  id: string;
  organizationId: string;
  /** The deployed Aegis build's own version identifier -- whatever Aegis itself uses (a semver string, a git SHA, etc.); Command Center doesn't parse or validate its shape, only stores and displays it. */
  version: string;
  /** Open vocabulary (e.g. ["compliance-monitor", "threat-intel-agent"]) -- which optional modules/plugins this specific deployment has installed. */
  installedModules: string[];
  licenseState: FleetLicenseState;
  /** Self-reported by the instance, 0-100. Not validated or recomputed by Command Center -- see this file's module doc comment for why. */
  healthScore: number;
  failedJobCount: number;
  pendingMigrationCount: number;
  /** When Command Center actually received this heartbeat -- Command Center's own clock, not a self-reported timestamp, since staleness detection needs a clock Command Center actually trusts. This IS "last heartbeat," from Command Center's point of view. */
  receivedAt: Date;
}

export interface FleetHeartbeatInput {
  version: string;
  installedModules: string[];
  licenseState: FleetLicenseState;
  healthScore: number;
  failedJobCount: number;
  pendingMigrationCount: number;
}

/**
 * The live fleet dashboard's actual unit: one organization's most
 * recent heartbeat, plus `stale` -- a fact Command Center derives
 * itself (see computeFleetSummary), not something any instance
 * self-reports, since an instance that's stopped reporting entirely
 * can't tell you it has.
 */
export interface FleetInstanceSummary {
  organizationId: string;
  latestHeartbeat: FleetHeartbeat;
  stale: boolean;
}
