import Link from "next/link";
import { requireSession } from "../../../lib/session";
import {
  listPolicies,
  listViolations,
  listApprovalRequests,
  listAllAuditEvidence,
  listComplianceFrameworks,
  getComplianceQueueSummary,
} from "../../../lib/adminApiClient";

export default async function GovernancePage() {
  const config = await requireSession();
  const [{ policies }, { violations: openViolations }, { requests: pendingApprovals }, { evidence: recentEvidence }, { frameworks }, queueSummary] =
    await Promise.all([
      listPolicies(config),
      listViolations(config, { status: "open" }),
      listApprovalRequests(config, { status: "pending" }),
      listAllAuditEvidence(config),
      listComplianceFrameworks(config),
      getComplianceQueueSummary(config),
    ]);

  const activePolicies = policies.filter((p) => p.status === "active");
  const reviewQueueTotal = queueSummary.new + queueSummary.pendingReview;

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
      <h1 className="text-lg font-semibold text-text-primary">Governance Console</h1>
      <p className="mt-1 text-sm text-text-muted">
        Everything an operator needs beyond a single narrow Compliance Agent: policies, violations, approvals, the review
        queue, evidence, and regulatory mappings, in one place.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Active Policies</p>
            <Link href="/governance/policies" className="text-xs text-primary-600 hover:underline">
              View all →
            </Link>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {activePolicies.length} <span className="text-sm font-normal text-text-muted">of {policies.length} total</span>
          </p>
          <div className="mt-3 space-y-1">
            {activePolicies.length === 0 ? (
              <p className="text-xs text-text-muted">None active yet.</p>
            ) : (
              activePolicies.slice(0, 4).map((p) => (
                <Link key={p.id} href={`/governance/policies/${p.key}`} className="block truncate text-xs text-text-primary hover:underline">
                  {p.name}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Policy Violations</p>
            <Link href="/governance/violations" className="text-xs text-primary-600 hover:underline">
              View all →
            </Link>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {openViolations.length} <span className="text-sm font-normal text-text-muted">open</span>
          </p>
          <div className="mt-3 space-y-1">
            {openViolations.length === 0 ? (
              <p className="text-xs text-text-muted">Nothing open.</p>
            ) : (
              openViolations.slice(0, 4).map((v) => (
                <p key={v.id} className="truncate text-xs text-text-primary">
                  <span className="text-danger">{v.severity}</span> · {v.description}
                </p>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Pending Approvals</p>
            <Link href="/governance/approvals" className="text-xs text-primary-600 hover:underline">
              View all →
            </Link>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{pendingApprovals.length}</p>
          <div className="mt-3 space-y-1">
            {pendingApprovals.length === 0 ? (
              <p className="text-xs text-text-muted">Nothing waiting.</p>
            ) : (
              pendingApprovals.slice(0, 4).map((r) => (
                <p key={r.id} className="truncate text-xs text-text-primary">
                  {r.summary}
                </p>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Human Review Queue</p>
            <Link href="/compliance/queue" className="text-xs text-primary-600 hover:underline">
              View all →
            </Link>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {reviewQueueTotal} <span className="text-sm font-normal text-text-muted">need attention</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
            <p>New: {queueSummary.new}</p>
            <p>Pending Review: {queueSummary.pendingReview}</p>
            <p>Duplicate: {queueSummary.duplicate}</p>
            <p>Rejected: {queueSummary.rejected}</p>
            <p>Published: {queueSummary.published}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Regulatory Mappings</p>
            <Link href="/compliance/frameworks" className="text-xs text-primary-600 hover:underline">
              View all →
            </Link>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{frameworks.length}</p>
          <p className="text-xs text-text-muted">frameworks mapped to canonical controls</p>
          <div className="mt-3 space-y-1">
            {frameworks.length === 0 ? (
              <p className="text-xs text-text-muted">None yet.</p>
            ) : (
              frameworks.slice(0, 4).map((f) => (
                <Link key={f.id} href={`/compliance/frameworks/${f.key}`} className="block truncate text-xs text-text-primary hover:underline">
                  {f.name}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-text-primary">Audit Evidence</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{recentEvidence.length}</p>
          <p className="text-xs text-text-muted">most recent, across every Control and Policy</p>
          <div className="mt-3 space-y-1">
            {recentEvidence.length === 0 ? (
              <p className="text-xs text-text-muted">Nothing on file yet.</p>
            ) : (
              recentEvidence.slice(0, 4).map((e) => (
                <p key={e.id} className="truncate text-xs text-text-primary">
                  <span className="text-text-muted">{e.targetType}</span> · {e.description}
                </p>
              ))
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Attached directly on a Control or Policy&rsquo;s own page -- browse{" "}
            <Link href="/compliance/controls" className="text-primary-600 hover:underline">
              Controls
            </Link>{" "}
            or{" "}
            <Link href="/governance/policies" className="text-primary-600 hover:underline">
              Policies
            </Link>{" "}
            to view or add evidence.
          </p>
        </div>
      </div>
    </div>
  );
}
