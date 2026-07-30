import type { JobRun, JobSchedule } from "./types.js";

export interface JobsRepository {
  createJobRun(run: JobRun): Promise<void>;
  updateJobRun(run: JobRun): Promise<void>;
  getJobRunById(id: string): Promise<JobRun | null>;
  /** Most recent runs across every job, newest first -- the History view. */
  listJobRuns(opts?: { jobKey?: string; limit?: number }): Promise<JobRun[]>;
  /** Failed runs specifically, newest first -- the Failures view, a real filtered query rather than listJobRuns({status: "failed"}) filtered in application code, since failures are exactly the runs a compliance team needs to find fast. */
  listFailedJobRuns(opts?: { limit?: number }): Promise<JobRun[]>;
  /** The most recent run for a given job, regardless of status -- what the live scheduler's "is this job due" check and the dashboard's own per-job status both need. Null if the job has never run. */
  getLatestJobRun(jobKey: string): Promise<JobRun | null>;
  /** The most recent run for every distinct jobKey that has ever run, one row each -- what the dashboard's own status list needs (Federal Register's own latest status, NIST's own latest status, ...), without an N+1 getLatestJobRun call per job. */
  listLatestJobRuns(): Promise<JobRun[]>;

  upsertJobSchedule(schedule: JobSchedule): Promise<void>;
  getJobSchedule(jobKey: string): Promise<JobSchedule | null>;
  listJobSchedules(): Promise<JobSchedule[]>;
}
