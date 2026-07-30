import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { JobsRepository } from "./repository.js";
import type { JobDefinition, JobRun, JobSchedule } from "./types.js";
import { buildSourceIngestionJobDefinitions } from "./jobRegistry.js";

export interface JobOverviewEntry {
  key: string;
  name: string;
  description: string;
  category: JobDefinition["category"];
  /** Null for a per-source ingestion job -- it has no schedule row of its own, see types.ts's own doc comment on why. Its real interval is on the source itself, surfaced here via sourceScheduleIntervalMinutes instead. */
  schedule: JobSchedule | null;
  /** Only set for a per-source ingestion job -- the interval it actually runs on, read from ComplianceSource.scheduleIntervalMinutes, not a duplicate schedule concept. */
  sourceScheduleIntervalMinutes: number | null;
  latestRun: JobRun | null;
}

/**
 * The dashboard's actual data: every registered job (static and
 * per-source), each with its own schedule (or source interval) and
 * most recent run. Composed from functions this module and Compliance
 * already have -- no new aggregation logic invented beyond joining
 * them together.
 */
export async function computeJobsOverview(
  jobsRepo: JobsRepository,
  complianceRepo: ComplianceRepository,
  staticDefinitions: JobDefinition[],
): Promise<JobOverviewEntry[]> {
  const sourceDefinitions = await buildSourceIngestionJobDefinitions(complianceRepo);
  const sources = await complianceRepo.listSources({ activeOnly: true });
  const sourceIntervalByJobKey = new Map(
    sources.filter((s) => s.sourceType !== "manual").map((s) => [`source-ingestion:${s.id}`, s.scheduleIntervalMinutes]),
  );

  const schedules = await jobsRepo.listJobSchedules();
  const scheduleByKey = new Map(schedules.map((s) => [s.jobKey, s]));

  const latestRuns = await jobsRepo.listLatestJobRuns();
  const latestRunByKey = new Map(latestRuns.map((r) => [r.jobKey, r]));

  const allDefinitions = [...staticDefinitions, ...sourceDefinitions];

  return allDefinitions.map((def) => ({
    key: def.key,
    name: def.name,
    description: def.description,
    category: def.category,
    schedule: scheduleByKey.get(def.key) ?? null,
    sourceScheduleIntervalMinutes: sourceIntervalByJobKey.get(def.key) ?? null,
    latestRun: latestRunByKey.get(def.key) ?? null,
  }));
}
