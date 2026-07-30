import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { listJobs } from "../../../lib/adminApiClient";
import { JobStatusBadge } from "../../../components/JobStatusBadge";
import { RunJobButton } from "../../../components/RunJobButton";

const CATEGORY_LABEL: Record<string, string> = {
  ingestion: "Ingestion",
  analysis: "Analysis",
  publishing: "Publishing",
  cleanup: "Cleanup",
};

export default async function JobsPage() {
  const config = await requireSession();
  const { jobs } = await listJobs(config);

  const byCategory = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const list = byCategory.get(job.category) ?? [];
    list.push(job);
    byCategory.set(job.category, list);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Platform</p>
          <h1 className="text-lg font-semibold text-text-primary">Scheduled Jobs</h1>
          <p className="mt-1 text-sm text-text-muted">
            The background work Aegis&apos;s own platform does -- pulling sources, analyzing regulations, publishing
            due alerts, cleaning up expired data. Each one genuinely scheduled, not just documented as intended.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/jobs/schedules" className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised">
            Schedules
          </Link>
          <Link href="/jobs/history" className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised">
            History
          </Link>
          <Link href="/jobs/failures" className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised">
            Failures
          </Link>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No jobs registered.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {[...byCategory.entries()].map(([category, categoryJobs]) => (
            <div key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {CATEGORY_LABEL[category] ?? category}
              </h2>
              <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                {categoryJobs.map((job) => (
                  <div key={job.key} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-text-primary">{job.name}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{job.description}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <JobStatusBadge
                        status={job.latestRun?.status ?? null}
                        completedAt={job.latestRun?.completedAt ?? null}
                      />
                      {job.latestRun?.status === "failed" ? (
                        <RunJobButton jobKey={job.key} label="Retry" />
                      ) : (
                        <RunJobButton jobKey={job.key} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
