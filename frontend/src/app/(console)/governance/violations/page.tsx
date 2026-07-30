import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listViolations, listPolicies } from "../../../../lib/adminApiClient";
import { ViolationItemActions } from "../../../../components/ViolationItemActions";

export default async function ViolationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const config = await requireSession();
  const validStatus = status === "open" || status === "resolved" || status === "dismissed" ? status : undefined;
  const [{ violations }, { policies }] = await Promise.all([listViolations(config, { status: validStatus }), listPolicies(config)]);
  const policyNameById = new Map(policies.map((p) => [p.id, p.name]));

  const tabs: Array<{ label: string; value: string | undefined }> = [
    { label: "Open", value: "open" },
    { label: "Resolved", value: "resolved" },
    { label: "Dismissed", value: "dismissed" },
    { label: "All", value: undefined },
  ];

  return (
    <div>
      <Link href="/governance" className="text-sm text-text-muted hover:underline">
        ← Governance
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Policy Violations</h1>
      <p className="mt-1 text-sm text-text-muted">Staff-reported -- Command Center has no automated signal that would let it detect these on its own.</p>

      <div className="mt-4 flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.value ? `/governance/violations?status=${t.value}` : "/governance/violations"}
            className={`rounded px-3 py-1 text-sm ${
              validStatus === t.value ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {violations.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing here.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {violations.map((v) => (
            <div key={v.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between">
                <Link href={`/governance/policies/${policies.find((p) => p.id === v.policyId)?.key ?? ""}`} className="text-sm text-text-primary hover:underline">
                  {policyNameById.get(v.policyId) ?? v.policyId}
                </Link>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                    v.status === "open" ? "bg-danger/10 text-danger" : v.status === "resolved" ? "bg-ok/10 text-ok" : "bg-surface-raised text-text-muted"
                  }`}
                >
                  {v.severity} · {v.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-primary">{v.description}</p>
              {v.organizationId && <p className="mt-1 text-xs text-text-muted">Org: {v.organizationId}</p>}
              {v.resolutionNotes && <p className="mt-1 text-xs text-text-muted">{v.resolutionNotes}</p>}
              <ViolationItemActions violationId={v.id} status={v.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
