import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listPolicies } from "../../../../lib/adminApiClient";

export default async function PoliciesPage() {
  const config = await requireSession();
  const { policies } = await listPolicies(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/governance" className="text-sm text-text-muted hover:underline">
            ← Governance
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Policies</h1>
          <p className="mt-1 text-sm text-text-muted">
            Platform-level governance statements, staff-authored, tied to canonical controls -- Command Center&rsquo;s own
            governance layer, distinct from Aegis&rsquo;s per-org policies.
          </p>
        </div>
        <Link href="/governance/policies/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Policy
        </Link>
      </div>

      {policies.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">No policies created yet.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {policies.map((p) => (
            <Link key={p.id} href={`/governance/policies/${p.key}`} className="block rounded-lg border border-border bg-surface p-3 hover:border-primary-500">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-primary">{p.name}</p>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    p.status === "active" ? "bg-ok/10 text-ok" : p.status === "retired" ? "bg-danger/10 text-danger" : "bg-surface-raised text-text-muted"
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{p.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
