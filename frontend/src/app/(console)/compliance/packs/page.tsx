import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listCompliancePacks } from "../../../../lib/adminApiClient";

export default async function CompliancePacksPage() {
  const config = await requireSession();
  const { packs } = await listCompliancePacks(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/compliance" className="text-sm text-text-muted hover:underline">
            ← Compliance
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Compliance Packs</h1>
          <p className="mt-1 text-sm text-text-muted">
            Bundles of controls triggered by the products an organization actually has -- the Products dimension of impact
            assessment.
          </p>
        </div>
        <Link href="/compliance/packs/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Pack
        </Link>
      </div>

      {packs.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No packs created yet.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {packs.map((p) => (
            <Link key={p.id} href={`/compliance/packs/${p.key}`} className="block rounded-lg border border-border bg-surface p-3 hover:border-primary-500">
              <p className="text-sm text-text-primary">{p.name}</p>
              <p className="mt-1 text-xs text-text-muted">{p.description}</p>
              <p className="mt-1 text-xs text-text-muted">
                {p.requiredProductKeys.length > 0 ? `Products: ${p.requiredProductKeys.join(", ")}` : "Not yet scoped to a product"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
