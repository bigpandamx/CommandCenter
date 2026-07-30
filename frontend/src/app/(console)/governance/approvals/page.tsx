import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listApprovalRequests } from "../../../../lib/adminApiClient";
import { ApprovalItemActions } from "../../../../components/ApprovalItemActions";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const config = await requireSession();
  const validStatus = status === "pending" || status === "approved" || status === "rejected" ? status : "pending";
  const { requests } = await listApprovalRequests(config, { status: validStatus });

  const tabs: Array<{ label: string; value: "pending" | "approved" | "rejected" }> = [
    { label: "Pending", value: "pending" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
  ];

  return (
    <div>
      <Link href="/governance" className="text-sm text-text-muted hover:underline">
        ← Governance
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Pending Approvals</h1>
      <p className="mt-1 text-sm text-text-muted">
        Agent recommendations, converted into a trackable decision. Nothing here was auto-detected -- an agent
        recommended it, and a staff member chose to send it here for review.
      </p>

      <div className="mt-4 flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/governance/approvals?status=${t.value}`}
            className={`rounded px-3 py-1 text-sm ${
              validStatus === t.value ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing here.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-3">
              <p className="text-sm text-text-primary">{r.summary}</p>
              <p className="mt-1 text-xs text-text-muted">
                {r.sourceType.replace(/_/g, " ")} · {new Date(r.requestedAt).toLocaleString()}
              </p>
              {r.decisionNotes && <p className="mt-1 text-xs text-text-muted">{r.decisionNotes}</p>}
              {r.status === "pending" && <ApprovalItemActions requestId={r.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
