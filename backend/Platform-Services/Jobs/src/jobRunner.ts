import { randomUUID } from "node:crypto";
import type { JobsRepository } from "./repository.js";
import type { JobDefinition, JobRun, JobRunTrigger } from "./types.js";

/**
 * Records the run before invoking the job (so a crash mid-run still
 * leaves a "running" row behind, not silence), then records success or
 * failure after -- never lets a thrown error escape uncaught, since a
 * live scheduler invoking this on a timer must not let one job's
 * exception kill the process or the next scheduler tick.
 */
export async function runJob(
  jobsRepo: JobsRepository,
  definition: JobDefinition,
  trigger: JobRunTrigger,
  triggeredByStaffId: string | null,
  now: Date = new Date(),
): Promise<JobRun> {
  const run: JobRun = {
    id: randomUUID(),
    jobKey: definition.key,
    status: "running",
    trigger,
    triggeredByStaffId,
    startedAt: now,
    completedAt: null,
    error: null,
    summary: null,
  };
  await jobsRepo.createJobRun(run);

  try {
    const result = await definition.run(now);
    const completed: JobRun = { ...run, status: "success", completedAt: new Date(), summary: result.summary };
    await jobsRepo.updateJobRun(completed);
    return completed;
  } catch (err) {
    const failed: JobRun = {
      ...run,
      status: "failed",
      completedAt: new Date(),
      error: err instanceof Error ? err.message : String(err),
    };
    await jobsRepo.updateJobRun(failed);
    return failed;
  }
}
