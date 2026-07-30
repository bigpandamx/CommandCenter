import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listJobs } from "../../../../lib/adminApiClient";
import { ScheduleEditor } from "../../../../components/ScheduleEditor";

export default async function JobSchedulesPage() {
  const config = await requireSession();
  const { jobs } = await listJobs(config);

  const staticJobs = jobs.filter((j) => !j.key.startsWith("source-ingestion:"));
  const sourceJobs = jobs.filter((j) => j.key.startsWith("source-ingestion:"));

  return (
    <div>
      <Link href="/jobs" className="text-sm text-text-muted hover:underline">
        ← Jobs
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Schedules</h1>
      <p className="mt-1 text-sm text-text-muted">
        Genuinely enforced -- a real scheduler checks these on a live interval, not just recorded intent.
      </p>

      <div className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">System Jobs</h2>
        <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
          {staticJobs.map((job) => (
            <div key={job.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-text-primary">{job.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">{job.description}</p>
              </div>
              <ScheduleEditor
                jobKey={job.key}
                currentIntervalMinutes={job.schedule?.intervalMinutes ?? null}
                currentEnabled={job.schedule?.enabled ?? false}
              />
            </div>
          ))}
        </div>
      </div>

      {sourceJobs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Source Ingestion</h2>
          <p className="mt-1 text-xs text-text-muted">
            Each source&apos;s own schedule -- edit it from{" "}
            <Link href="/compliance/sources" className="underline">
              Source Management
            </Link>
            , not here, since it&apos;s the same field either way.
          </p>
          <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {sourceJobs.map((job) => (
              <div key={job.key} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-text-primary">{job.name}</p>
                <p className="text-xs text-text-muted">
                  {job.sourceScheduleIntervalMinutes ? `Every ${job.sourceScheduleIntervalMinutes} min` : "No interval set"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
