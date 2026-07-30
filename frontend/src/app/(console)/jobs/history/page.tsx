import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listJobHistory } from "../../../../lib/adminApiClient";
import { JobStatusBadge } from "../../../../components/JobStatusBadge";

export default async function JobHistoryPage() {
  const config = await requireSession();
  const { runs } = await listJobHistory(config, { limit: 200 });

  return (
    <div>
      <Link href="/jobs" className="text-sm text-text-muted hover:underline">
        ← Jobs
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Job History</h1>
      <p className="mt-1 text-sm text-text-muted">Every run, across every job, most recent first.</p>

      {runs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">No runs yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Trigger</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{run.jobKey}</td>
                  <td className="px-4 py-3">
                    <JobStatusBadge status={run.status} completedAt={run.completedAt} />
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {run.trigger === "manual" ? "Manual" : "Scheduler"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{new Date(run.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{run.summary ?? run.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
