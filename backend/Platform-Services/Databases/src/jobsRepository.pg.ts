/**
 * Postgres implementation of Platform-Services/Jobs' JobsRepository
 * port. Same offline caveat as the other *.pg.ts files in this folder:
 * type-checked against pg's documented API, not executed against a
 * live database in this session.
 */
import type { Pool } from "pg";
import type { JobsRepository } from "../../../Platform-Services/Jobs/src/repository.js";
import type { JobRun, JobSchedule } from "../../../Platform-Services/Jobs/src/types.js";

export class PgJobsRepository implements JobsRepository {
  constructor(private readonly pool: Pool) {}

  async createJobRun(run: JobRun): Promise<void> {
    await this.pool.query(
      `INSERT INTO job_runs (id, job_key, status, trigger, triggered_by_staff_id, started_at, completed_at, error, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [run.id, run.jobKey, run.status, run.trigger, run.triggeredByStaffId, run.startedAt, run.completedAt, run.error, run.summary],
    );
  }

  async updateJobRun(run: JobRun): Promise<void> {
    await this.pool.query(
      `UPDATE job_runs SET status = $2, completed_at = $3, error = $4, summary = $5 WHERE id = $1`,
      [run.id, run.status, run.completedAt, run.error, run.summary],
    );
  }

  async getJobRunById(id: string): Promise<JobRun | null> {
    const { rows } = await this.pool.query(`SELECT * FROM job_runs WHERE id = $1`, [id]);
    return rows[0] ? mapJobRun(rows[0]) : null;
  }

  async listJobRuns(opts?: { jobKey?: string; limit?: number }): Promise<JobRun[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = opts?.jobKey
      ? await this.pool.query(`SELECT * FROM job_runs WHERE job_key = $1 ORDER BY started_at DESC LIMIT $2`, [opts.jobKey, limit])
      : await this.pool.query(`SELECT * FROM job_runs ORDER BY started_at DESC LIMIT $1`, [limit]);
    return rows.map(mapJobRun);
  }

  async listFailedJobRuns(opts?: { limit?: number }): Promise<JobRun[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM job_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapJobRun);
  }

  async getLatestJobRun(jobKey: string): Promise<JobRun | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM job_runs WHERE job_key = $1 ORDER BY started_at DESC LIMIT 1`,
      [jobKey],
    );
    return rows[0] ? mapJobRun(rows[0]) : null;
  }

  async listLatestJobRuns(): Promise<JobRun[]> {
    // Postgres's own idiomatic "one row per group, the most recent"
    // pattern -- same DISTINCT ON approach as Fleet Operations'
    // listLatestHeartbeats, for the identical reason.
    const { rows } = await this.pool.query(
      `SELECT DISTINCT ON (job_key) * FROM job_runs ORDER BY job_key, started_at DESC`,
    );
    return rows.map(mapJobRun);
  }

  async upsertJobSchedule(schedule: JobSchedule): Promise<void> {
    await this.pool.query(
      `INSERT INTO job_schedules (job_key, interval_minutes, enabled, updated_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (job_key) DO UPDATE SET interval_minutes = $2, enabled = $3, updated_at = $4`,
      [schedule.jobKey, schedule.intervalMinutes, schedule.enabled, schedule.updatedAt],
    );
  }

  async getJobSchedule(jobKey: string): Promise<JobSchedule | null> {
    const { rows } = await this.pool.query(`SELECT * FROM job_schedules WHERE job_key = $1`, [jobKey]);
    return rows[0] ? mapJobSchedule(rows[0]) : null;
  }

  async listJobSchedules(): Promise<JobSchedule[]> {
    const { rows } = await this.pool.query(`SELECT * FROM job_schedules ORDER BY job_key ASC`);
    return rows.map(mapJobSchedule);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobRun(row: any): JobRun {
  return {
    id: row.id,
    jobKey: row.job_key,
    status: row.status,
    trigger: row.trigger,
    triggeredByStaffId: row.triggered_by_staff_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
    summary: row.summary,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobSchedule(row: any): JobSchedule {
  return {
    jobKey: row.job_key,
    intervalMinutes: Number(row.interval_minutes),
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}
