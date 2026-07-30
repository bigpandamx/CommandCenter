import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import {
  listComplianceControls,
  listObligationsForControl,
  getControlLibraryStatsForControl,
  listEvidenceForTarget,
  listCustomerPoliciesForControl,
  listOrganizations,
} from "../../../../../lib/adminApiClient";
import { EvidenceControl } from "../../../../../components/EvidenceControl";

export default async function ControlDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();
  const [{ controls }, { obligations }, stats, { policies: customerPolicies }, { organizations }] = await Promise.all([
    listComplianceControls(config),
    listObligationsForControl(config, key),
    getControlLibraryStatsForControl(config, key),
    listCustomerPoliciesForControl(config, key),
    listOrganizations(config),
  ]);
  const control = controls.find((c) => c.key === key);
  const { evidence } = control ? await listEvidenceForTarget(config, "control", control.id) : { evidence: [] };
  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));

  return (
    <div>
      <Link href="/compliance/controls" className="text-sm text-text-muted hover:underline">
        ← Controls
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">
        <span className="font-mono text-sm text-text-muted">{control?.code ?? key}</span> — {control?.name ?? key}
      </h1>
      {control && <p className="mt-1 text-sm text-text-muted">{control.description}</p>}

      <div className="mt-4 flex gap-6 rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-2xl font-semibold text-text-primary">{stats.mappedObligationCount.toLocaleString()}</p>
          <p className="text-xs text-text-muted">Mapped Rules</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-text-primary">{stats.organizationsImpactedCount.toLocaleString()}</p>
          <p className="text-xs text-text-muted">Organizations Impacted</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-text-muted">Mapped Obligations</p>
        {obligations.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No obligations mapped to this control yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {obligations.map((o) => (
              <div key={o.id} className="rounded-lg border border-border bg-surface p-3">
                <p className="text-sm text-text-primary">{o.description}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {o.obligationType}
                  {o.industries.length > 0 ? ` · ${o.industries.join(", ")}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {control && (
        <div className="mt-6">
          <p className="text-xs font-medium text-text-muted">Audit Evidence</p>
          <p className="mt-1 text-xs text-text-muted">
            What&rsquo;s on file proving this control is actually being followed -- staff-attached, not auto-detected.
          </p>
          <div className="mt-2">
            <EvidenceControl targetType="control" targetId={control.id} evidence={evidence} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="text-xs font-medium text-text-muted">Customer Policies</p>
        <p className="mt-1 text-xs text-text-muted">Organizations whose own submitted policy documents cover this control.</p>
        {customerPolicies.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No customer policies mapped to this control yet.</p>
        ) : (
          <div className="mt-2 space-y-1">
            {customerPolicies.map((p) => (
              <div key={p.id} className="rounded border border-border px-3 py-1.5 text-sm">
                <Link href={`/organizations/${p.organizationId}`} className="text-text-primary hover:underline">
                  {orgNameById.get(p.organizationId) ?? p.organizationId}
                </Link>
                <span className="text-text-muted"> — {p.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
