import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import { listComplianceUpdatesByStatus, type ComplianceUpdateStatus } from "../../../../../lib/adminApiClient";
import { QueueItemActions } from "../../../../../components/QueueItemActions";

const LABELS: Record<ComplianceUpdateStatus, string> = {
  new: "New",
  pending_review: "Pending Review",
  duplicate: "Duplicates",
  rejected: "Rejected",
  published: "Published",
};

const VALID_STATUSES: ComplianceUpdateStatus[] = ["new", "pending_review", "duplicate", "rejected", "published"];

export default async function QueueStatusPage({ params }: { params: Promise<{ status: string }> }) {
  const { status } = await params;
  const config = await requireSession();

  if (!VALID_STATUSES.includes(status as ComplianceUpdateStatus)) {
    return (
      <div>
        <Link href="/compliance/queue" className="text-sm text-text-muted hover:underline">
          ← Queue
        </Link>
        <p className="mt-4 text-sm text-text-muted">Not a real queue folder.</p>
      </div>
    );
  }

  const typedStatus = status as ComplianceUpdateStatus;
  const { updates } = await listComplianceUpdatesByStatus(config, typedStatus);

  return (
    <div>
      <Link href="/compliance/queue" className="text-sm text-text-muted hover:underline">
        ← Queue
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">{LABELS[typedStatus]}</h1>

      {updates.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing here.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {updates.map((u) => (
            <div key={u.id} className="rounded-lg border border-border bg-surface p-3">
              <Link href={`/compliance/${u.id}`} className="text-sm text-text-primary hover:underline">
                {u.title}
              </Link>
              <p className="mt-1 text-xs text-text-muted">
                {u.documentType}
                {u.country ? ` · ${u.country}` : ""}
              </p>
              <div className="mt-2">
                <QueueItemActions updateId={u.id} status={u.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
