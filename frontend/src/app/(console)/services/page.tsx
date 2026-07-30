import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { listCatalogServices } from "../../../lib/adminApiClient";

function formatPrice(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}/mo`;
}

export default async function ServicesPage() {
  const config = await requireSession();
  const { services } = await listCatalogServices(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Service Catalog</h1>
        <Link
          href="/services/new"
          className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700"
        >
          New Service
        </Link>
      </div>

      {services.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No services in the catalog yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Minimum Tier</th>
                <th className="px-4 py-2">Trial</th>
                <th className="px-4 py-2">Metered</th>
                <th className="px-4 py-2">Monthly Cost</th>
                <th className="px-4 py-2">Entitlement</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2 text-text-primary">
                    {s.name}
                    {!s.isActive && <span className="ml-2 text-xs text-text-muted">(inactive)</span>}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{s.category}</td>
                  <td className="px-4 py-2 text-text-muted">{s.minimumPlanCode ?? "—"}</td>
                  <td className="px-4 py-2 text-text-muted">{s.supportsTrial ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-text-muted">{s.usageMeterKey ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-text-muted">{formatPrice(s.monthlyPriceCents)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">{s.entitlementKey ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/services/${s.key}/edit`} className="text-xs text-primary-600 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
