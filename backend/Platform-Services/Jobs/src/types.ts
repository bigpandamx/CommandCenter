/**
 * Jobs: a single home for the background work Aegis's own platform
 * already does, or is meant to. Confirmed against the real codebase
 * before designing anything, not assumed: `runComplianceIngestion`/
 * `runComplianceIngestionForSource`, `analyzeUnanalyzedUpdates`,
 * `publishDueScheduledAnnouncements`, and `cleanupExpiredData` all
 * already existed as real, callable functions -- every one of them
 * explicitly documented, at the point it was built, as "not yet wired
 * to a live cron." This module is that wiring, finally done, plus the
 * execution history and manual-trigger surface those functions never
 * had a shared home for.
 *
 * Deliberately NOT included, because nothing real backs them: "AI
 * provider advisories," "refresh service catalog," and "sync
 * organizations" aren't real jobs anywhere in this codebase --
 * inventing job entries for functions that don't exist would be
 * fabrication, not registration. "Run impact assessment" as a
 * scheduled background job is also not included -- Impact Assessment
 * today is synchronous and on-demand, triggered by a specific staff
 * action on a specific obligation; there's no "assess everything"
 * batch operation to schedule, and inventing one wasn't asked for or
 * grounded in anything real.
 *
 * Two genuinely different kinds of job live here, both real:
 * - STATIC jobs: a small, fixed set of named system processes
 *   (Compliance Analysis, Announcement Publishing, Threat Intel
 *   Cleanup), each independently schedulable via JobSchedule.
 * - PER-SOURCE jobs: one dynamically derived per active, non-manual
 *   ComplianceSource (Federal Register, NIST, ...), reusing the
 *   schedule field that source already has
 *   (ComplianceSource.scheduleIntervalMinutes) rather than inventing a
 *   second, parallel schedule concept for the same fact.
 */

export type JobRunStatus = "running" | "success" | "failed";
export type JobRunTrigger = "scheduler" | "manual";

export interface JobRun {
  id: string;
  /** Stable identifier -- a static job's own key (e.g. "compliance-analysis"), or `source-ingestion:${sourceId}` for a per-source ingestion run. */
  jobKey: string;
  status: JobRunStatus;
  trigger: JobRunTrigger;
  /** Set only when trigger is "manual" -- who clicked Run Now. */
  triggeredByStaffId: string | null;
  startedAt: Date;
  /** Null while status is "running." */
  completedAt: Date | null;
  /** Present only when status is "failed." */
  error: string | null;
  /** A short, human-readable outcome (e.g. "12 updates ingested, 2 errors") -- each job's own wrapper formats this; Jobs itself doesn't interpret a job's return value beyond success/failure. */
  summary: string | null;
}

/**
 * Staff-configurable execution interval for a STATIC job. Per-source
 * ingestion jobs do NOT get a row here -- they already have
 * ComplianceSource.scheduleIntervalMinutes, and duplicating that as a
 * second schedule concept for the same underlying fact would create
 * two places that could disagree with each other.
 */
export interface JobSchedule {
  jobKey: string;
  intervalMinutes: number;
  /** A disabled job is skipped by the live scheduler entirely, but can still be run manually -- same "schedule vs. can-still-trigger" distinction Distribution Center's own unschedule already established for announcements. */
  enabled: boolean;
  updatedAt: Date;
}

/** The code-level registry entry -- not persisted, since a job is code (a real function to call), not data. Built once at server startup, closing over whatever repositories that specific job actually needs. */
export interface JobDefinition {
  key: string;
  name: string;
  description: string;
  category: "ingestion" | "analysis" | "publishing" | "cleanup";
  run: (now: Date) => Promise<{ summary: string }>;
}
