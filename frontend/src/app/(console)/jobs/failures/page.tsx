import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listJobFailures } from "../../../../lib/adminApiClient";
import { RunJobButton } from "../../../../components/RunJobButton";

export default async function JobFailuresPage() {
  const config = await requireSession();
  const { runs } = await listJobFailures(config, 100);

  return (
    <div>
      <Link href="/jobs" className="text-sm text-text-muted hover:underline">
        ← Jobs
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Failures</h1>
      <p className="mt-1 text-sm text-text-muted">Every failed run, most recent first -- exactly what a compliance team needs to find fast.</p>

      {runs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No failures on record.
        </p>
      ) : (
        <div className="mt-6 space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-danger/30 bg-danger/5 p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-text-muted">{run.jobKey}</p>
                  <p className="mt-1 text-sm text-danger">{run.error ?? "Unknown error"}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {new Date(run.startedAt).toLocaleString()} · {run.trigger === "manual" ? "Manual" : "Scheduler"}
                  </p>
                </div>
                <RunJobButton jobKey={run.jobKey} label="Retry" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
