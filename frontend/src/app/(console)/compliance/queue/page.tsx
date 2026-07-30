import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { getComplianceQueueSummary } from "../../../../lib/adminApiClient";

export default async function ComplianceQueuePage() {
  const config = await requireSession();
  const summary = await getComplianceQueueSummary(config);

  const folders: Array<{ status: string; label: string; count: number; description: string }> = [
    { status: "new", label: "New", count: summary.new, description: "Ingested, not yet analyzed" },
    { status: "pending_review", label: "Pending Review", count: summary.pendingReview, description: "Analyzed -- awaiting a staff decision" },
    { status: "duplicate", label: "Duplicates", count: summary.duplicate, description: "Flagged as a duplicate of another tracked item" },
    { status: "rejected", label: "Rejected", count: summary.rejected, description: "Not used" },
    { status: "published", label: "Published", count: summary.published, description: "Approved" },
  ];

  return (
    <div>
      <Link href="/compliance" className="text-sm text-text-muted hover:underline">
        ← Compliance
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Incoming Queue</h1>
      <p className="mt-1 text-sm text-text-muted">
        {summary.new} new regulation{summary.new === 1 ? "" : "s"} awaiting analysis. Think of this like an inbox.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {folders.map((f) => (
          <Link
            key={f.status}
            href={`/compliance/queue/${f.status}`}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 hover:border-primary-500"
          >
            <div>
              <p className="text-sm text-text-primary">{f.label}</p>
              <p className="mt-1 text-xs text-text-muted">{f.description}</p>
            </div>
            <span className="text-2xl font-semibold text-text-primary">{f.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
