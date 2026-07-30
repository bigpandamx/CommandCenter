import { SubmitCustomerPolicyForm } from "./SubmitCustomerPolicyForm";
import { CustomerPolicyItemActions } from "./CustomerPolicyItemActions";

interface ControlOption {
  key: string;
  code: string;
  name: string;
}

interface CustomerPolicyEntry {
  id: string;
  name: string;
  description: string;
  documentUrl: string | null;
  status: "pending_review" | "reviewed" | "rejected";
  submittedAt: string;
  reviewNotes: string | null;
  mappedControls: ControlOption[];
}

export function CustomerPoliciesView({
  organizationId,
  policies,
  allControls,
}: {
  organizationId: string;
  policies: CustomerPolicyEntry[];
  allControls: ControlOption[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Customer Policies</p>
        <SubmitCustomerPolicyForm organizationId={organizationId} />
      </div>
      <p className="mt-1 text-xs text-text-muted">
        This organization&rsquo;s own internal policy documents, mapped onto the controls they cover.
      </p>

      {policies.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">None submitted yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {policies.map((p) => (
            <div key={p.id} className="rounded border border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-primary">{p.name}</p>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                    p.status === "pending_review"
                      ? "bg-warn/10 text-warn"
                      : p.status === "reviewed"
                        ? "bg-ok/10 text-ok"
                        : "bg-danger/10 text-danger"
                  }`}
                >
                  {p.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{p.description}</p>
              {p.documentUrl && (
                <a href={p.documentUrl} target="_blank" rel="noreferrer" className="mt-0.5 block text-xs text-primary-600 hover:underline">
                  {p.documentUrl}
                </a>
              )}
              {p.reviewNotes && <p className="mt-1 text-xs text-text-muted">{p.reviewNotes}</p>}
              <CustomerPolicyItemActions policyId={p.id} status={p.status} mappedControls={p.mappedControls} allControls={allControls} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
