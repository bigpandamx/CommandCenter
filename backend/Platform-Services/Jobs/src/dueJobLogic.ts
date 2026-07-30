import type { JobRun } from "./types.js";

export interface DueCheckCandidate {
  jobKey: string;
  intervalMinutes: number;
  enabled: boolean;
}

/**
 * Pure: given a set of candidate jobs (their own interval + enabled
 * flag) and each one's most recent run (if any), which ones are
 * actually due right now. No repository access, no clock reads beyond
 * the `now` passed in -- the live scheduler (scheduler.ts) is a thin
 * wrapper that fetches the real inputs and calls this on a timer; this
 * function itself is what's actually tested.
 */
export function computeDueJobKeys(candidates: DueCheckCandidate[], latestRunByKey: Map<string, JobRun>, now: Date): string[] {
  const due: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.enabled) continue;

    const latest = latestRunByKey.get(candidate.jobKey);
    if (!latest) {
      // Never run at all -- due immediately, not held back until an
      // arbitrary first interval has elapsed from server startup.
      due.push(candidate.jobKey);
      continue;
    }
    if (latest.status === "running") {
      // Don't start a second overlapping run of the same job --
      // covers both a genuinely long-running job and (defensively) a
      // run that never got marked complete for some other reason.
      continue;
    }

    const referenceTime = latest.completedAt ?? latest.startedAt;
    const elapsedMinutes = (now.getTime() - referenceTime.getTime()) / 60_000;
    if (elapsedMinutes >= candidate.intervalMinutes) {
      due.push(candidate.jobKey);
    }
  }
  return due;
}
