/**
 * Deployment Status -- Platform Health's fifth and last named
 * capability. Honestly scoped: there is no real deploy pipeline
 * anywhere in this repo to report on. `.github/workflows/ci.yml` runs
 * tests and typechecks on push/PR -- it does not build, tag, or deploy
 * anything. `deployment/monitoring/` and `deployment/docker/dev/`
 * reference `redis`, `qwen-runner`, and `mistral-runner` -- Aegis's own
 * infrastructure (the product Command Center manages), not Command
 * Center's own `backend/api`, which has no cache and no local model
 * runners anywhere in this codebase. Building a rollout/canary/
 * multi-region status view against either of those would mean
 * reporting on infrastructure that isn't actually this service's.
 *
 * What IS honestly knowable: what build is THIS specific running
 * process, and how long has it been up. That's a real, useful fact --
 * "is the latest deploy actually live, or is this instance stuck on an
 * old build" -- even without rollout/canary tracking. `version` comes
 * from GIT_COMMIT_SHA, an env var nothing currently sets (no deploy
 * step exists to set it) -- reported as "unknown" rather than
 * fabricated, which is itself informative: an operator seeing
 * "unknown" learns that deploy-time version stamping isn't wired up
 * yet, not a wrong answer dressed up as a right one.
 *
 * A single current fact, not a time series -- unlike AiCallRecord/
 * RequestLatencyRecord, there's nothing here to persist. Captured once
 * at process startup (captureStartupInfo, called from server.ts) and
 * combined with the current time on each read (computeDeploymentStatus)
 * -- no database table, no migration, because there's nothing to
 * remember across restarts that isn't already implied by "the process
 * restarted."
 */

export interface StartupInfo {
  version: string;
  environment: string;
  nodeVersion: string;
  startedAt: Date;
}

export interface DeploymentStatus extends StartupInfo {
  uptimeSeconds: number;
}

/** Called once, at process startup (server.ts), not per-request -- startedAt needs to be fixed at the moment the process actually came up. */
export function captureStartupInfo(): StartupInfo {
  return {
    version: process.env.GIT_COMMIT_SHA ?? "unknown",
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    startedAt: new Date(),
  };
}

export function computeDeploymentStatus(startupInfo: StartupInfo, now: Date = new Date()): DeploymentStatus {
  return {
    ...startupInfo,
    uptimeSeconds: Math.max(0, Math.floor((now.getTime() - startupInfo.startedAt.getTime()) / 1000)),
  };
}
