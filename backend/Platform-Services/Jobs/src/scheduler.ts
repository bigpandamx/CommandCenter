import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { JobsRepository } from "./repository.js";
import type { JobDefinition, JobRun } from "./types.js";
import { computeDueJobKeys, type DueCheckCandidate } from "./dueJobLogic.js";
import { buildSourceIngestionJobDefinitions } from "./jobRegistry.js";
import { runJob } from "./jobRunner.js";

/**
 * One scheduler tick: figure out what's due, run it, move on -- fully
 * testable with fake repositories and a fixed `now`, no real timers
 * involved. `startJobScheduler` (below) is the only part of this file
 * that isn't meaningfully unit-testable, since its entire job is
 * calling this repeatedly on a real timer.
 *
 * One job's failure never stops the tick from running the rest -- same
 * "a stuck record shouldn't block everything else due" resilience
 * pattern as `analyzeUnanalyzedUpdates`/`distributeObligationImpact`/
 * `publishDueScheduledAnnouncements`, all elsewhere in this codebase.
 *
 * defaultSourceIntervalMinutes: absorbed from a genuinely separate,
 * earlier scheduler (Control-Plane/Compliance/src/schedulerRunner.ts's
 * `startComplianceScheduler`, since retired) that this codebase had
 * already built and wired into server.ts before this module existed --
 * found only by grepping for `onClose` while investigating a request
 * to add graceful shutdown, not known in advance. That scheduler ran
 * EVERY active, non-manual source hourly, unconditionally -- including
 * ones with no `scheduleIntervalMinutes` ever configured, since that
 * field started life as "recorded intent, not yet enforced by any real
 * scheduler." Without this fallback, retiring that scheduler would
 * have silently regressed any such source from "checked hourly" to
 * "never checked automatically" -- a real coverage loss, not a
 * cleanup. Applying it here instead means Jobs is now a genuine,
 * behavior-preserving superset of what that scheduler did, not a
 * parallel mechanism with a gap in it.
 */
export async function runSchedulerTick(
  jobsRepo: JobsRepository,
  complianceRepo: ComplianceRepository,
  staticDefinitions: JobDefinition[],
  now: Date = new Date(),
  defaultSourceIntervalMinutes: number = 60,
): Promise<JobRun[]> {
  const sourceDefinitions = await buildSourceIngestionJobDefinitions(complianceRepo);
  const allDefinitions = [...staticDefinitions, ...sourceDefinitions];

  const schedules = await jobsRepo.listJobSchedules();
  const scheduleByKey = new Map(schedules.map((s) => [s.jobKey, s]));

  const staticCandidates: DueCheckCandidate[] = staticDefinitions
    .map((def) => {
      const schedule = scheduleByKey.get(def.key);
      if (!schedule) return null; // no schedule configured yet -- not due, staff hasn't set an interval
      return { jobKey: def.key, intervalMinutes: schedule.intervalMinutes, enabled: schedule.enabled };
    })
    .filter((c): c is DueCheckCandidate => c !== null);

  const sources = await complianceRepo.listSources({ activeOnly: true });
  const sourceCandidates: DueCheckCandidate[] = sources
    .filter((s) => s.sourceType !== "manual")
    .map((s) => ({
      jobKey: `source-ingestion:${s.id}`,
      // Falls back to defaultSourceIntervalMinutes when the source has
      // no explicit interval recorded -- see this function's own doc
      // comment for why that fallback exists at all.
      intervalMinutes: s.scheduleIntervalMinutes ?? defaultSourceIntervalMinutes,
      enabled: true,
    }));

  const candidates = [...staticCandidates, ...sourceCandidates];

  const latestRuns = await jobsRepo.listLatestJobRuns();
  const latestRunByKey = new Map(latestRuns.map((r) => [r.jobKey, r]));

  const dueKeys = computeDueJobKeys(candidates, latestRunByKey, now);

  const results: JobRun[] = [];
  for (const key of dueKeys) {
    const definition = allDefinitions.find((d) => d.key === key);
    if (!definition) continue; // a schedule exists for a job that's no longer registered -- skip, don't crash the tick
    const run = await runJob(jobsRepo, definition, "scheduler", null, now);
    results.push(run);
  }
  return results;
}

/**
 * The actual live wiring -- genuinely runs `runSchedulerTick` on an
 * interval, without any request needed to trigger it. Returns a stop
 * function for clean shutdown (and so tests that construct a scheduler
 * can tear it down without leaking a timer). Only runs while this Node
 * process is alive -- a process restart resets the interval, the same
 * as any single-process in-memory timer; not a flaw, just what "live"
 * means for a service without a separate scheduler process.
 */
export function startJobScheduler(
  jobsRepo: JobsRepository,
  complianceRepo: ComplianceRepository,
  staticDefinitions: JobDefinition[],
  tickIntervalMs: number,
  defaultSourceIntervalMinutes: number = 60,
  onTickError: (err: unknown) => void = (err) => console.error("Job scheduler tick failed", err),
): () => void {
  const timer = setInterval(() => {
    runSchedulerTick(jobsRepo, complianceRepo, staticDefinitions, new Date(), defaultSourceIntervalMinutes).catch(onTickError);
  }, tickIntervalMs);

  // Don't let this timer alone keep the process alive -- same
  // reasoning as the two schedulers this module absorbed
  // (Compliance's and Agents' own schedulerRunner.ts, both of which
  // already did this). The `as unknown as {unref?}` cast is purely a
  // workaround for this offline sandbox's stand-in @types/node shim,
  // which doesn't override DOM's setInterval signature (returns
  // `number`) with Node's real one (returns NodeJS.Timeout, which has
  // .unref()) -- harmless once real @types/node is installed.
  (timer as unknown as { unref?: () => void }).unref?.();

  return () => clearInterval(timer);
}
