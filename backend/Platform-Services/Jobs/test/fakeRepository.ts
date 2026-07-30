import type { JobsRepository } from "../src/repository.js";
import type { JobRun, JobSchedule } from "../src/types.js";

export class FakeJobsRepository implements JobsRepository {
  runs = new Map<string, JobRun>();
  schedules = new Map<string, JobSchedule>();

  async createJobRun(run: JobRun) {
    this.runs.set(run.id, run);
  }

  async updateJobRun(run: JobRun) {
    this.runs.set(run.id, run);
  }

  async getJobRunById(id: string) {
    return this.runs.get(id) ?? null;
  }

  async listJobRuns(opts?: { jobKey?: string; limit?: number }) {
    let all = [...this.runs.values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    if (opts?.jobKey) all = all.filter((r) => r.jobKey === opts.jobKey);
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async listFailedJobRuns(opts?: { limit?: number }) {
    const failed = [...this.runs.values()]
      .filter((r) => r.status === "failed")
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return opts?.limit ? failed.slice(0, opts.limit) : failed;
  }

  async getLatestJobRun(jobKey: string) {
    const forKey = [...this.runs.values()].filter((r) => r.jobKey === jobKey);
    if (forKey.length === 0) return null;
    return forKey.reduce((latest, r) => (r.startedAt.getTime() > latest.startedAt.getTime() ? r : latest));
  }

  async listLatestJobRuns() {
    const latestByKey = new Map<string, JobRun>();
    for (const run of this.runs.values()) {
      const existing = latestByKey.get(run.jobKey);
      if (!existing || run.startedAt.getTime() > existing.startedAt.getTime()) {
        latestByKey.set(run.jobKey, run);
      }
    }
    return [...latestByKey.values()];
  }

  async upsertJobSchedule(schedule: JobSchedule) {
    this.schedules.set(schedule.jobKey, schedule);
  }

  async getJobSchedule(jobKey: string) {
    return this.schedules.get(jobKey) ?? null;
  }

  async listJobSchedules() {
    return [...this.schedules.values()];
  }
}
