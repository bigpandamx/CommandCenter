-- 0046_jobs.sql
-- Jobs: execution history for every background job (a real one, not a
-- fabricated one -- see Platform-Services/Jobs/src/types.ts's own
-- module doc comment for exactly which functions this covers and why
-- several requested items were deliberately left out), plus
-- staff-configurable schedules for the small, fixed set of STATIC
-- jobs. Per-source ingestion jobs do NOT get a schedule row here --
-- they already have compliance_sources.schedule_interval_minutes, and
-- a second schedule concept for the same fact would just create a way
-- for the two to disagree.

BEGIN;

CREATE TABLE IF NOT EXISTS job_runs (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_key                TEXT NOT NULL,
    status                 TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    trigger                TEXT NOT NULL CHECK (trigger IN ('scheduler', 'manual')),
    triggered_by_staff_id  UUID,
    started_at             TIMESTAMPTZ NOT NULL,
    completed_at           TIMESTAMPTZ,
    error                  TEXT,
    summary                TEXT
);

-- Supports listJobRuns({jobKey}) and the History view's own
-- newest-first ordering across every job.
CREATE INDEX IF NOT EXISTS idx_job_runs_job_key_started_at ON job_runs(job_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at DESC);
-- Supports listFailedJobRuns -- a real, indexed, filtered query for
-- exactly the runs a compliance team needs to find fast, not
-- listJobRuns fetched in full and filtered in application code.
CREATE INDEX IF NOT EXISTS idx_job_runs_failed ON job_runs(started_at DESC) WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS job_schedules (
    job_key          TEXT PRIMARY KEY,
    interval_minutes INTEGER NOT NULL CHECK (interval_minutes > 0),
    enabled          BOOLEAN NOT NULL DEFAULT true,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
