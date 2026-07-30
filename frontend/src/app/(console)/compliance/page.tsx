import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { listComplianceUpdates } from "../../../lib/adminApiClient";

export default async function CompliancePage() {
  const config = await requireSession();
  const { updates } = await listComplianceUpdates(config, { limit: 50 });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Compliance</h1>
          <p className="mt-1 text-sm text-text-muted">Ingested regulatory updates. Select one to review its obligations and impact.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/compliance/operations" className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-raised">
            Operations
          </Link>
          <Link href="/compliance/rules" className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-raised">
            Browse Rules
          </Link>
          <Link href="/compliance/controls" className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-raised">
            Browse Controls
          </Link>
          <Link href="/compliance/frameworks" className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-raised">
            Browse Frameworks
          </Link>
          <Link href="/compliance/packs" className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-raised">
            Browse Packs
          </Link>
          <Link href="/compliance/sources" className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-raised">
            Manage Sources
          </Link>
          <Link href="/compliance/queue" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
            Queue
          </Link>
        </div>
      </div>

      {updates.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No compliance updates ingested yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2">Industries</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Published</th>
              </tr>
            </thead>
            <tbody>
              {updates.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link href={`/compliance/${u.id}`} className="text-text-primary hover:underline">
                      {u.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{u.country ?? "—"}</td>
                  <td className="px-4 py-2 text-text-muted">{u.industries.length > 0 ? u.industries.join(", ") : "—"}</td>
                  <td className="px-4 py-2 text-text-muted">{u.documentType}</td>
                  <td className="px-4 py-2 text-text-muted">{u.publishedAt ? new Date(u.publishedAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
