import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import { listPolicies, listComplianceControls, listControlsForPolicy, listViolationsForPolicy, listEvidenceForTarget } from "../../../../../lib/adminApiClient";
import { PolicyControlsControl } from "../../../../../components/PolicyControlsControl";
import { PolicyStatusControl } from "../../../../../components/PolicyStatusControl";
import { ReportViolationForm } from "../../../../../components/ReportViolationForm";
import { ViolationItemActions } from "../../../../../components/ViolationItemActions";
import { EvidenceControl } from "../../../../../components/EvidenceControl";

export default async function PolicyDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();
  const [{ policies }, { controls: implemented }, { controls: allControls }] = await Promise.all([
    listPolicies(config),
    listControlsForPolicy(config, key),
    listComplianceControls(config),
  ]);
  const policy = policies.find((p) => p.key === key);
  const { violations } = policy ? await listViolationsForPolicy(config, policy.id) : { violations: [] };
  const { evidence } = policy ? await listEvidenceForTarget(config, "policy", policy.id) : { evidence: [] };

  return (
    <div>
      <Link href="/governance/policies" className="text-sm text-text-muted hover:underline">
        ← Policies
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">{policy?.name ?? key}</h1>
      {policy && <p className="mt-1 text-sm text-text-muted">{policy.description}</p>}

      {policy && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-text-muted">
            Status: <span className="text-text-primary">{policy.status}</span>
          </p>
          <div className="mt-2">
            <PolicyStatusControl policyKey={key} status={policy.status} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-text-primary">Implements</h2>
        <div className="mt-2">
          <PolicyControlsControl
            policyKey={key}
            implemented={implemented.map((c) => ({ key: c.key, code: c.code, name: c.name }))}
            allControls={allControls.map((c) => ({ key: c.key, code: c.code, name: c.name }))}
          />
        </div>
      </div>

      {policy && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Violations</h2>
            <ReportViolationForm policyId={policy.id} />
          </div>
          {violations.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">No violations reported.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {violations.map((v) => (
                <div key={v.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-text-primary">{v.description}</p>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                        v.status === "open"
                          ? "bg-danger/10 text-danger"
                          : v.status === "resolved"
                            ? "bg-ok/10 text-ok"
                            : "bg-surface-raised text-text-muted"
                      }`}
                    >
                      {v.severity} · {v.status}
                    </span>
                  </div>
                  {v.organizationId && <p className="mt-1 text-xs text-text-muted">Org: {v.organizationId}</p>}
                  {v.resolutionNotes && <p className="mt-1 text-xs text-text-muted">{v.resolutionNotes}</p>}
                  <ViolationItemActions violationId={v.id} status={v.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {policy && (
        <div className="mt-6">
          <p className="text-xs font-medium text-text-muted">Audit Evidence</p>
          <p className="mt-1 text-xs text-text-muted">
            What&rsquo;s on file proving this policy is actually being followed -- staff-attached, not auto-detected.
          </p>
          <div className="mt-2">
            <EvidenceControl targetType="policy" targetId={policy.id} evidence={evidence} />
          </div>
        </div>
      )}
    </div>
  );
}
